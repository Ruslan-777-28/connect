import { FieldValue } from 'firebase-admin/firestore';

import { adminDb } from './firebase';

const TRANSLATION_COLLECTION = 'callTranslations';

export async function getTranslationDoc(callId: string) {
  const ref = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);
  const snap = await ref.get();
  return { ref, snap, data: snap.exists ? snap.data() : null };
}

export async function markWorkerJoining(callId: string) {
  const ref = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);

  await ref.set(
    {
      status: 'starting',
      botStatus: 'joining',
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastError: null,
    },
    { merge: true },
  );
}

export async function markWorkerJoined(callId: string) {
  const ref = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);

  await ref.set(
    {
      status: 'starting',
      botStatus: 'joined',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function markWorkerProcessing(callId: string) {
  const ref = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);

  await ref.set(
    {
      status: 'active',
      botStatus: 'processing',
      activatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function markWorkerEnded(callId: string, reason = 'worker_stopped') {
  const ref = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);

  await ref.set(
    {
      enabled: false,
      status: 'ended',
      botStatus: 'left',
      endedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      stopReason: reason,
    },
    { merge: true },
  );
}

export async function markWorkerError(callId: string, code: string, message: string) {
  const ref = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);

  await ref.set(
    {
      status: 'error',
      botStatus: 'failed',
      updatedAt: FieldValue.serverTimestamp(),
      lastError: {
        code,
        message,
        source: 'bot',
        at: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );
}