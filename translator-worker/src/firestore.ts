import { FieldValue } from 'firebase-admin/firestore';

import { adminDb } from './firebase';

const TRANSLATION_COLLECTION = 'callTranslations';
const SEGMENTS_SUBCOLLECTION = 'segments';

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

export async function appendTestSegment(params: {
  callId: string;
  speakerUid: string;
  speakerRole: 'caller' | 'callee';
  speakerDisplayName?: string | null;
  sourceLocale: string;
  targetLocale: string;
  originalText: string;
  translatedText: string;
  isFinal: boolean;
  sequence: number;
  latencyMs?: number | null;
}) {
  const docRef = adminDb
    .collection(TRANSLATION_COLLECTION)
    .doc(params.callId)
    .collection(SEGMENTS_SUBCOLLECTION)
    .doc(`seg_${String(params.sequence).padStart(4, '0')}`);

  await docRef.set({
    callId: params.callId,

    speakerUid: params.speakerUid,
    speakerRole: params.speakerRole,
    speakerDisplayName: params.speakerDisplayName ?? null,

    sourceLocale: params.sourceLocale,
    targetLocale: params.targetLocale,

    originalText: params.originalText,
    translatedText: params.translatedText,

    isFinal: params.isFinal,
    sequence: params.sequence,

    startedAt: null,
    emittedAt: FieldValue.serverTimestamp(),
    finalizedAt: params.isFinal ? FieldValue.serverTimestamp() : null,

    latencyMs: params.latencyMs ?? null,

    provider: 'azure_speech',
    status: params.isFinal ? 'final' : 'partial',
    errorCode: null,
  });

  await adminDb
    .collection(TRANSLATION_COLLECTION)
    .doc(params.callId)
    .set(
      {
        lastSegmentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        metrics: {
          totalSegments: FieldValue.increment(1),
          finalSegments: FieldValue.increment(params.isFinal ? 1 : 0),
          partialSegments: FieldValue.increment(params.isFinal ? 0 : 1),
        },
      },
      { merge: true },
    );
}

export async function clearSegments(callId: string) {
  const snap = await adminDb
    .collection(TRANSLATION_COLLECTION)
    .doc(callId)
    .collection(SEGMENTS_SUBCOLLECTION)
    .get();

  if (snap.empty) return;

  const batch = adminDb.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
}
