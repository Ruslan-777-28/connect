import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import { adminDb } from '@/lib/firebase/admin';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

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
