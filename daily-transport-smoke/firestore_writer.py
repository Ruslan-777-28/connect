import os
import threading
from typing import Dict, Optional

import firebase_admin
from firebase_admin import credentials, firestore


def _normalize_private_key(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return value.replace("\\n", "\n")


def init_firestore():
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
    private_key = _normalize_private_key(os.getenv("FIREBASE_PRIVATE_KEY"))

    if not project_id or not client_email or not private_key:
        raise RuntimeError(
            "Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY"
        )

    if not firebase_admin._apps:
        cred = credentials.Certificate(
            {
                "type": "service_account",
                "project_id": project_id,
                "client_email": client_email,
                "private_key": private_key,
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        )
        firebase_admin.initialize_app(cred)

    return firestore.client()


class SegmentWriter:
    def __init__(self, db, call_id: str):
        self.db = db
        self.call_id = call_id
        self.lock = threading.Lock()
        self.sequence_by_participant: Dict[str, int] = {}
        self.last_partial_doc_id: Dict[str, str] = {}

    @property
    def translation_doc_ref(self):
        return self.db.collection("callTranslations").document(self.call_id)

    @property
    def segments_col_ref(self):
        return self.translation_doc_ref.collection("segments")

    def clear_segments(self):
        docs = list(self.segments_col_ref.stream())
        if not docs:
            return

        batch = self.db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()

    def _next_sequence(self, participant_id: str) -> int:
        with self.lock:
            current = self.sequence_by_participant.get(participant_id, 0) + 1
            self.sequence_by_participant[participant_id] = current
            return current

    def _segment_doc_id(self, participant_id: str, sequence: int, is_final: bool) -> str:
        suffix = "f" if is_final else "p"
        safe_pid = participant_id.replace("/", "_")
        return f"{safe_pid}_{sequence:06d}_{suffix}"

    def write_partial(
        self,
        *,
        participant_id: str,
        speaker_role: str,
        speaker_display_name: Optional[str],
        source_locale: str,
        target_locale: str,
        original_text: str,
        translated_text: str,
        latency_ms: Optional[int] = None,
    ):
        sequence = self._next_sequence(participant_id)
        doc_id = self._segment_doc_id(participant_id, sequence, is_final=False)

        payload = {
            "callId": self.call_id,
            "speakerUid": participant_id,
            "speakerRole": speaker_role,
            "speakerDisplayName": speaker_display_name,
            "sourceLocale": source_locale,
            "targetLocale": target_locale,
            "originalText": original_text,
            "translatedText": translated_text,
            "isFinal": False,
            "sequence": sequence,
            "startedAt": None,
            "emittedAt": firestore.SERVER_TIMESTAMP,
            "finalizedAt": None,
            "latencyMs": latency_ms,
            "provider": "azure_speech",
            "status": "partial",
            "errorCode": None,
        }

        self.segments_col_ref.document(doc_id).set(payload)

        self.translation_doc_ref.set(
            {
                "lastSegmentAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "metrics": {
                    "totalSegments": firestore.Increment(1),
                    "partialSegments": firestore.Increment(1),
                },
            },
            merge=True,
        )

        with self.lock:
            self.last_partial_doc_id[participant_id] = doc_id

    def write_final(
        self,
        *,
        participant_id: str,
        speaker_role: str,
        speaker_display_name: Optional[str],
        source_locale: str,
        target_locale: str,
        original_text: str,
        translated_text: str,
        latency_ms: Optional[int] = None,
    ):
        sequence = self._next_sequence(participant_id)
        doc_id = self._segment_doc_id(participant_id, sequence, is_final=True)

        payload = {
            "callId": self.call_id,
            "speakerUid": participant_id,
            "speakerRole": speaker_role,
            "speakerDisplayName": speaker_display_name,
            "sourceLocale": source_locale,
            "targetLocale": target_locale,
            "originalText": original_text,
            "translatedText": translated_text,
            "isFinal": True,
            "sequence": sequence,
            "startedAt": None,
            "emittedAt": firestore.SERVER_TIMESTAMP,
            "finalizedAt": firestore.SERVER_TIMESTAMP,
            "latencyMs": latency_ms,
            "provider": "azure_speech",
            "status": "final",
            "errorCode": None,
        }

        self.segments_col_ref.document(doc_id).set(payload)

        self.translation_doc_ref.set(
            {
                "status": "active",
                "botStatus": "processing",
                "activatedAt": firestore.SERVER_TIMESTAMP,
                "lastSegmentAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "metrics": {
                    "totalSegments": firestore.Increment(1),
                    "finalSegments": firestore.Increment(1),
                },
            },
            merge=True,
        )

    def mark_error(self, code: str, message: str):
        self.translation_doc_ref.set(
            {
                "status": "error",
                "botStatus": "failed",
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "lastError": {
                    "code": code,
                    "message": message,
                    "source": "azure",
                    "at": firestore.SERVER_TIMESTAMP,
                },
            },
            merge=True,
        )
