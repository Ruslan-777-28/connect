import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import { adminDb } from '@/lib/firebase/admin';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';
import { stopWorkerTranslationSession } from '@/lib/translation/worker-client';

interface StopTranslationRequestBody {
  reason?: string;
  callStatus?: 'pending' | 'accepted' | 'active' | 'ended' | 'missed';
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> },
) {
  try {
    const { callId } = await context.params;

    if (!callId) {
      return NextResponse.json({ error: 'Missing callId' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as StopTranslationRequestBody;

    const translationRef = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);
    const snap = await translationRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { error: 'Translation session not found' },
        { status: 404 },
      );
    }

    let worker;
    try {
      worker = await stopWorkerTranslationSession({
        callId,
        reason: body.reason ?? 'manual',
      });
    } catch (workerError) {
      const message =
        workerError instanceof Error ? workerError.message : 'Unknown worker stop error';

      await translationRef.set(
        {
          updatedAt: FieldValue.serverTimestamp(),
          lastError: {
            code: 'WORKER_STOP_FAILED',
            message,
            source: 'bot',
            at: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );

      return NextResponse.json(
        {
          error: 'Translation stop requested, but worker failed to stop cleanly',
          details: message,
        },
        { status: 502 },
      );
    }

    await translationRef.set(
      {
        enabled: false,
        status: 'ended',
        botStatus: 'left',
        callStatus: body.callStatus ?? 'ended',
        endedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        stopReason: body.reason ?? 'manual',
      },
      { merge: true },
    );

    const savedSnap = await translationRef.get();

    return NextResponse.json({
      ok: true,
      callId,
      worker,
      translation: savedSnap.data(),
    });
  } catch (error) {
    console.error('[translation/stop] failed:', error);

    return NextResponse.json(
      {
        error: 'Failed to stop translation session',
      },
      { status: 500 },
    );
  }
}
