import os
import sys
import time
import signal
import threading
from typing import Dict, Optional

from dotenv import load_dotenv

from daily import Daily, CallClient, EventHandler, AudioData
import azure.cognitiveservices.speech as speechsdk

from firestore_writer import init_firestore, SegmentWriter


load_dotenv()

ROOM_URL = os.getenv("DAILY_ROOM_URL")
MEETING_TOKEN = os.getenv("DAILY_MEETING_TOKEN") or None
SAMPLE_RATE = int(os.getenv("DAILY_SAMPLE_RATE", "16000"))
CALLBACK_INTERVAL_MS = int(os.getenv("DAILY_CALLBACK_INTERVAL_MS", "20"))
AUDIO_SOURCE = os.getenv("DAILY_AUDIO_SOURCE", "microphone")
BOT_NAME = os.getenv("DAILY_BOT_NAME", "translator-transport-bot")

AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION")
AZURE_SOURCE_LOCALE = os.getenv("AZURE_SOURCE_LOCALE", "en-US")
AZURE_TARGET_LOCALE = os.getenv("AZURE_TARGET_LOCALE", "uk")

TRANSLATION_CALL_ID = os.getenv("TRANSLATION_CALL_ID")

if not ROOM_URL:
    print("ERROR: DAILY_ROOM_URL is required")
    sys.exit(1)

if not AZURE_SPEECH_KEY or not AZURE_SPEECH_REGION:
    print("ERROR: AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are required")
    sys.exit(1)

if not TRANSLATION_CALL_ID:
    print("ERROR: TRANSLATION_CALL_ID is required")
    sys.exit(1)

shutdown_event = threading.Event()


def handle_shutdown(signum, frame):
    print(f"\n[system] received signal {signum}, shutting down...")
    shutdown_event.set()


class JoinWaiter:
    def __init__(self):
        self.event = threading.Event()
        self.error = None

    def callback(self, join_data, error):
        self.error = error
        self.event.set()


db = init_firestore()
segment_writer = SegmentWriter(db, TRANSLATION_CALL_ID)


class AzureStreamPipeline:
    def __init__(self, participant_id: str, participant_meta: dict, sample_rate: int):
        self.participant_id = participant_id
        self.sample_rate = sample_rate
        self.closed = False
        self.participant_meta = participant_meta

        translation_config = speechsdk.translation.SpeechTranslationConfig(
            subscription=AZURE_SPEECH_KEY,
            region=AZURE_SPEECH_REGION,
        )
        translation_config.speech_recognition_language = (
            participant_meta.get("sourceLocale") or AZURE_SOURCE_LOCALE
        )
        translation_config.add_target_language(
            participant_meta.get("targetLocaleShort") or AZURE_TARGET_LOCALE
        )

        stream_format = speechsdk.audio.AudioStreamFormat(
            samples_per_second=sample_rate,
            bits_per_sample=16,
            channels=1,
        )
        self.push_stream = speechsdk.audio.PushAudioInputStream(stream_format=stream_format)
        audio_config = speechsdk.audio.AudioConfig(stream=self.push_stream)

        self.recognizer = speechsdk.translation.TranslationRecognizer(
            translation_config=translation_config,
            audio_config=audio_config,
        )

        self.recognizer.recognizing.connect(self._on_recognizing)
        self.recognizer.recognized.connect(self._on_recognized)
        self.recognizer.canceled.connect(self._on_canceled)

    def start(self):
        self.recognizer.start_continuous_recognition()
        print(f"[azure] started recognizer for participant={self.participant_id}")

    def write(self, data: bytes):
        if self.closed:
            return
        self.push_stream.write(data)

    def stop(self):
        if self.closed:
            return

        self.closed = True

        try:
            self.recognizer.stop_continuous_recognition()
        except Exception as exc:
            print(f"[azure] stop error participant={self.participant_id}: {exc}")

        try:
            self.push_stream.close()
        except Exception as exc:
            print(f"[azure] push stream close error participant={self.participant_id}: {exc}")

    def _on_recognizing(self, evt):
        result = evt.result
        if not result:
            return

        original_text = result.text or ""
        target_key = self.participant_meta.get("targetLocaleShort") or AZURE_TARGET_LOCALE
        translated_text = ""
        try:
            translated_text = result.translations.get(target_key) or ""
        except Exception:
            translated_text = ""

        if not original_text and not translated_text:
            return

        print(
            f"[partial] participant={self.participant_id} src='{original_text}' tgt='{translated_text}'"
        )

        segment_writer.write_partial(
            participant_id=self.participant_id,
            speaker_role=self.participant_meta["role"],
            speaker_display_name=self.participant_meta.get("displayName"),
            source_locale=self.participant_meta["sourceLocale"],
            target_locale=self.participant_meta["targetLocale"],
            original_text=original_text,
            translated_text=translated_text,
            latency_ms=None,
        )

    def _on_recognized(self, evt):
        result = evt.result
        if not result:
            return

        original_text = result.text or ""
        target_key = self.participant_meta.get("targetLocaleShort") or AZURE_TARGET_LOCALE
        translated_text = ""
        try:
            translated_text = result.translations.get(target_key) or ""
        except Exception:
            translated_text = ""

        if not original_text and not translated_text:
            return

        print(
            f"[final] participant={self.participant_id} src='{original_text}' tgt='{translated_text}'"
        )

        segment_writer.write_final(
            participant_id=self.participant_id,
            speaker_role=self.participant_meta["role"],
            speaker_display_name=self.participant_meta.get("displayName"),
            source_locale=self.participant_meta["sourceLocale"],
            target_locale=self.participant_meta["targetLocale"],
            original_text=original_text,
            translated_text=translated_text,
            latency_ms=None,
        )

    def _on_canceled(self, evt):
        details = getattr(evt, "error_details", None)
        message = f"participant={self.participant_id} reason={evt.reason} details={details}"
        print(f"[azure] canceled {message}")
        segment_writer.mark_error("AZURE_CANCELED", message)


class PipelineRegistry:
    def __init__(self):
        self.lock = threading.Lock()
        self.pipelines: Dict[str, AzureStreamPipeline] = {}

    def ensure_pipeline(self, participant_id: str, participant_meta: dict, sample_rate: int):
        with self.lock:
            pipeline = self.pipelines.get(participant_id)
            if pipeline is None:
                pipeline = AzureStreamPipeline(participant_id, participant_meta, sample_rate)
                pipeline.start()
                self.pipelines[participant_id] = pipeline
            return pipeline

    def stop_all(self):
        with self.lock:
            pipelines = list(self.pipelines.values())
            self.pipelines.clear()

        for pipeline in pipelines:
            pipeline.stop()


pipelines = PipelineRegistry()


def short_target_code(locale: str) -> str:
    return locale.split("-")[0] if "-" in locale else locale


def build_participant_meta(participant: dict) -> dict:
    user_name = participant.get("user_name") or participant.get("userName") or "Participant"

    # smoke defaults; later this comes from Firestore participants map
    if "tarolog" in user_name.lower():
        source_locale = "uk-UA"
        target_locale = "en-US"
        role = "caller"
    else:
        source_locale = "en-US"
        target_locale = "uk-UA"
        role = "callee"

    return {
        "displayName": user_name,
        "role": role,
        "sourceLocale": source_locale,
        "targetLocale": target_locale,
        "targetLocaleShort": short_target_code(target_locale),
    }


def audio_callback(participant_id: str, audio: AudioData, audio_source: str):
    if audio.bits_per_sample != 16:
        print(f"[drop] participant={participant_id} unsupported bits_per_sample={audio.bits_per_sample}")
        return

    if audio.num_channels != 1:
        print(f"[drop] participant={participant_id} unsupported channels={audio.num_channels}")
        return

    if audio.sample_rate not in (8000, 16000):
        print(f"[drop] participant={participant_id} unsupported sample_rate={audio.sample_rate}")
        return

    meta = participant_meta_by_id.get(participant_id)
    if not meta:
        return

    pipeline = pipelines.ensure_pipeline(participant_id, meta, audio.sample_rate)
    pipeline.write(audio.audio_frames)


participant_meta_by_id: Dict[str, dict] = {}


class SmokeHandler(EventHandler):
    def __init__(self):
        super().__init__()
        self.local_participant_id: Optional[str] = None
        self.subscribed_ids = set()

    def on_call_state_updated(self, state):
        print(f"[daily] call state updated: {state}")

    def on_participant_joined(self, participant):
        pid = participant.get("id")
        is_local = participant.get("local", False)
        user_name = participant.get("user_name") or participant.get("userName")

        print(f"[daily] participant joined: id={pid} local={is_local} user={user_name}")

        if is_local and pid:
            self.local_participant_id = pid

        if pid and not is_local:
            participant_meta_by_id[pid] = build_participant_meta(participant)

        self.try_attach_renderer(client, participant)

    def on_participant_updated(self, participant):
        pid = participant.get("id")
        if pid and not participant.get("local", False):
            participant_meta_by_id[pid] = build_participant_meta(participant)

        self.try_attach_renderer(client, participant)

    def on_participant_left(self, participant, reason):
        pid = participant.get("id")
        print(f"[daily] participant left: id={pid} reason={reason}")

    def on_error(self, error):
        print("[daily] error:", error)

    def try_attach_renderer(self, client: CallClient, participant: dict):
        pid = participant.get("id")
        if not pid:
            return

        if participant.get("local", False):
            return

        if pid == self.local_participant_id:
            return

        if pid in self.subscribed_ids:
            return

        tracks = participant.get("tracks", {})
        mic = tracks.get("microphone", {})
        state = mic.get("state")

        if state not in ("playable", "interrupted", "loading", "sendable", "subscribed"):
            return

        try:
            client.set_audio_renderer(
                pid,
                audio_callback,
                audio_source=AUDIO_SOURCE,
                sample_rate=SAMPLE_RATE,
                callback_interval_ms=CALLBACK_INTERVAL_MS,
            )
            self.subscribed_ids.add(pid)
            print(
                f"[daily] attached renderer participant_id={pid} "
                f"sample_rate={SAMPLE_RATE} callback_interval_ms={CALLBACK_INTERVAL_MS}"
            )
        except Exception as exc:
            print(f"[daily] failed to attach renderer for {pid}: {exc}")


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

segment_writer.clear_segments()

print("[system] initializing Daily SDK...")
Daily.init(worker_threads=2)

handler = SmokeHandler()
client = CallClient(event_handler=handler)
client.set_user_name(BOT_NAME)

join_waiter = JoinWaiter()

print(f"[system] joining room: {ROOM_URL}")
client.join(
    ROOM_URL,
    meeting_token=MEETING_TOKEN,
    completion=join_waiter.callback,
)

joined = join_waiter.event.wait(timeout=20)
if not joined:
    print("[system] ERROR: join timeout")
    try:
        client.release()
    finally:
        Daily.deinit()
    sys.exit(1)

if join_waiter.error:
    print("[system] ERROR: join failed:", join_waiter.error)
    try:
        client.release()
    finally:
        Daily.deinit()
    sys.exit(1)

print("[system] joined successfully")
print("[system] streaming Daily audio into Azure and writing captions to Firestore...")

try:
    while not shutdown_event.is_set():
        time.sleep(0.25)
finally:
    print("[system] stopping pipelines...")
    pipelines.stop_all()

    print("[system] leaving room...")
    leave_done = threading.Event()

    def on_leave(error):
        if error:
            print("[daily] leave error:", error)
        leave_done.set()

    try:
        client.leave(completion=on_leave)
        leave_done.wait(timeout=5)
    except Exception as exc:
        print("[system] leave exception:", exc)

    try:
        client.release()
    except Exception as exc:
        print("[system] release exception:", exc)

    try:
        Daily.deinit()
    except Exception as exc:
        print("[system] deinit exception:", exc)

    print("[system] shutdown complete")
