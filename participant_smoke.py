import os
import sys
import time
import signal
import threading
from typing import Dict, Optional

from dotenv import load_dotenv
from daily import Daily, CallClient, EventHandler, AudioData


load_dotenv()

ROOM_URL = os.getenv("DAILY_ROOM_URL")
MEETING_TOKEN = os.getenv("DAILY_MEETING_TOKEN") or None

SAMPLE_RATE = int(os.getenv("DAILY_SAMPLE_RATE", "16000"))
CALLBACK_INTERVAL_MS = int(os.getenv("DAILY_CALLBACK_INTERVAL_MS", "20"))
AUDIO_SOURCE = os.getenv("DAILY_AUDIO_SOURCE", "microphone")
BOT_NAME = os.getenv("DAILY_BOT_NAME", "translator-transport-bot")

if not ROOM_URL:
    print("ERROR: DAILY_ROOM_URL is required")
    sys.exit(1)

if CALLBACK_INTERVAL_MS % 10 != 0:
    print("ERROR: DAILY_CALLBACK_INTERVAL_MS must be a multiple of 10")
    sys.exit(1)


shutdown_event = threading.Event()


def handle_shutdown(signum, frame):
    print(f"\n[system] received signal {signum}, shutting down...")
    shutdown_event.set()


class JoinWaiter:
    def __init__(self):
        self.event = threading.Event()
        self.error = None
        self.join_data = None

    def callback(self, join_data, error):
        self.join_data = join_data
        self.error = error
        self.event.set()


class AudioTracker:
    def __init__(self):
        self.lock = threading.Lock()
        self.stats: Dict[str, dict] = {}

    def ensure(self, participant_id: str):
        with self.lock:
            if participant_id not in self.stats:
                self.stats[participant_id] = {
                    "chunks": 0,
                    "bytes": 0,
                    "first_audio_at": None,
                    "last_audio_at": None,
                    "sample_rate": None,
                    "num_channels": None,
                    "bits_per_sample": None,
                    "num_audio_frames": 0,
                    "source": None,
                }

    def update(self, participant_id: str, audio: AudioData, audio_source: str):
        now = time.time()
        with self.lock:
            if participant_id not in self.stats:
                self.ensure(participant_id)

            s = self.stats[participant_id]
            s["chunks"] += 1
            s["bytes"] += len(audio.audio_frames)
            s["last_audio_at"] = now
            s["sample_rate"] = audio.sample_rate
            s["num_channels"] = audio.num_channels
            s["bits_per_sample"] = audio.bits_per_sample
            s["num_audio_frames"] += audio.num_audio_frames
            s["source"] = audio_source

            if s["first_audio_at"] is None:
                s["first_audio_at"] = now

    def snapshot(self):
        with self.lock:
            return {k: dict(v) for k, v in self.stats.items()}


audio_tracker = AudioTracker()


def audio_callback(participant_id: str, audio: AudioData, audio_source: str):
    audio_tracker.update(participant_id, audio, audio_source)


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

        self.try_attach_renderer(client, participant)

    def on_participant_updated(self, participant):
        pid = participant.get("id")
        tracks = participant.get("tracks", {})
        mic = tracks.get("microphone", {})
        state = mic.get("state")

        if pid:
            print(f"[daily] participant updated: {pid} microphone.state={state}")

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

        # attach once the remote mic exists and isn't blocked/off
        if state not in ("playable", "interrupted", "loading", "sendable", "subscribed"):
            # keep waiting for a more usable state
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
                f"[smoke] attached renderer: participant_id={pid} "
                f"source={AUDIO_SOURCE} sample_rate={SAMPLE_RATE} "
                f"callback_interval_ms={CALLBACK_INTERVAL_MS}"
            )
        except Exception as exc:
            print(f"[smoke] failed to attach renderer for {pid}: {exc}")


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

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
print("[system] waiting for remote participants and per-participant audio callbacks...")

started_at = time.time()
last_log_at = started_at

try:
    while not shutdown_event.is_set():
        time.sleep(0.2)

        now = time.time()
        if now - last_log_at >= 1.0:
            elapsed = now - started_at
            snap = audio_tracker.snapshot()

            if not snap:
                print(f"[smoke] elapsed={elapsed:.1f}s no per-participant audio yet")
            else:
                print(f"[smoke] elapsed={elapsed:.1f}s participants={len(snap)}")
                for pid, s in snap.items():
                    approx_pcm_seconds = 0.0
                    sample_rate = s["sample_rate"] or SAMPLE_RATE
                    channels = s["num_channels"] or 1
                    bits_per_sample = s["bits_per_sample"] or 16
                    bytes_per_second = sample_rate * channels * (bits_per_sample // 8)
                    if bytes_per_second > 0:
                        approx_pcm_seconds = s["bytes"] / bytes_per_second

                    print(
                        "  "
                        f"id={pid} chunks={s['chunks']} bytes={s['bytes']} "
                        f"frames={s['num_audio_frames']} sr={sample_rate} "
                        f"ch={channels} bps={bits_per_sample} "
                        f"src={s['source']} approx_pcm={approx_pcm_seconds:.2f}s"
                    )

            last_log_at = now

finally:
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
