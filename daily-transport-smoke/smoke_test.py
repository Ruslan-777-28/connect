import os
import sys
import time
import signal
import threading
from typing import Optional

from dotenv import load_dotenv

from daily import Daily, CallClient, EventHandler


load_dotenv()


ROOM_URL = os.getenv("DAILY_ROOM_URL")
MEETING_TOKEN = os.getenv("DAILY_MEETING_TOKEN") or None
SAMPLE_RATE = int(os.getenv("DAILY_SAMPLE_RATE", "16000"))
CHANNELS = int(os.getenv("DAILY_CHANNELS", "1"))
READ_INTERVAL_MS = int(os.getenv("DAILY_READ_INTERVAL_MS", "20"))
SPEAKER_NAME = os.getenv("DAILY_SPEAKER_NAME", "transport-smoke-speaker")

if not ROOM_URL:
    print("ERROR: DAILY_ROOM_URL is required")
    sys.exit(1)

if CHANNELS not in (1, 2):
    print("ERROR: DAILY_CHANNELS must be 1 or 2")
    sys.exit(1)

if READ_INTERVAL_MS % 10 != 0:
    print("ERROR: DAILY_READ_INTERVAL_MS must be a multiple of 10")
    sys.exit(1)


class SmokeHandler(EventHandler):
    def on_call_state_updated(self, state):
        print(f"[daily] call state updated: {state}")

    def on_participant_joined(self, participant):
        print(
            "[daily] participant joined:",
            participant.get("id"),
            participant.get("user_name") or participant.get("userName"),
        )

    def on_participant_left(self, participant, reason):
        print(
            "[daily] participant left:",
            participant.get("id"),
            "reason=",
            reason,
        )

    def on_participant_updated(self, participant):
        pid = participant.get("id")
        tracks = participant.get("tracks", {})
        mic = tracks.get("microphone", {})
        state = mic.get("state")
        if pid:
            print(f"[daily] participant updated: {pid} microphone.state={state}")

    def on_error(self, error):
        print("[daily] error:", error)


class JoinWaiter:
    def __init__(self):
        self.event = threading.Event()
        self.error = None
        self.join_data = None

    def callback(self, join_data, error):
        self.join_data = join_data
        self.error = error
        self.event.set()


shutdown_event = threading.Event()


def handle_shutdown(signum, frame):
    print(f"\n[system] received signal {signum}, shutting down...")
    shutdown_event.set()


def main():
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    print("[system] initializing Daily SDK...")
    Daily.init(worker_threads=2)

    print(
        f"[system] creating virtual speaker: name={SPEAKER_NAME}, "
        f"sample_rate={SAMPLE_RATE}, channels={CHANNELS}"
    )
    speaker = Daily.create_speaker_device(
        SPEAKER_NAME,
        sample_rate=SAMPLE_RATE,
        channels=CHANNELS,
        non_blocking=False,
    )
    Daily.select_speaker_device(SPEAKER_NAME)

    handler = SmokeHandler()
    client = CallClient(event_handler=handler)

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
    print("[system] smoke test is now reading mixed meeting audio")
    print("[system] ask one human participant to speak for 5-10 seconds")

    frames_per_read = int(SAMPLE_RATE * (READ_INTERVAL_MS / 1000.0))
    total_chunks = 0
    total_bytes = 0
    first_audio_at: Optional[float] = None
    started_at = time.time()
    last_log_at = started_at

    try:
        while not shutdown_event.is_set():
            frames = speaker.read_frames(frames_per_read)

            if frames:
                total_chunks += 1
                total_bytes += len(frames)

                if first_audio_at is None:
                    first_audio_at = time.time()
                    print(
                        f"[smoke] first audio received after "
                        f"{first_audio_at - started_at:.2f}s"
                    )

            now = time.time()
            if now - last_log_at >= 1.0:
                elapsed = now - started_at
                approx_pcm_seconds = 0.0
                if CHANNELS > 0:
                    # 16-bit PCM => 2 bytes per sample
                    bytes_per_second = SAMPLE_RATE * CHANNELS * 2
                    approx_pcm_seconds = total_bytes / bytes_per_second

                print(
                    "[smoke] "
                    f"elapsed={elapsed:.1f}s "
                    f"chunks={total_chunks} "
                    f"bytes={total_bytes} "
                    f"approx_pcm={approx_pcm_seconds:.2f}s"
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


if __name__ == "__main__":
    main()
