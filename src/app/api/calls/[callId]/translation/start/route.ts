
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import { adminDb } from '@/lib/firebase/admin';
import { buildInitialTranslationDoc } from '@/lib/translation/firestore';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';
import { startWorkerTranslationSession } from '@/lib/translation/worker-client';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> },
) {
  try {
    const { callId } = await context.params;

    if (!callId) {
      return NextResponse.json({ error: 'Missing callId' }, { status: 400 });
    }

    // 1. Fetch the call document
    const callSnap = await adminDb.collection('calls').doc(callId).get();
    if (!callSnap.exists) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }
    const call = callSnap.data();
    const { callerId, receiverId, roomName, roomUrl } = call;

    // 2. Fetch profiles to get preferredLanguage
    const [callerSnap, receiverSnap] = await Promise.all([
      adminDb.collection('users').doc(callerId).get(),
      adminDb.collection('users').doc(receiverId).get(),
    ]);

    const caller = callerSnap.data() || {};
    const receiver = receiverSnap.data() || {};

    const callerLang = caller.preferredLanguage || 'uk-UA';
    const receiverLang = receiver.preferredLanguage || 'en-US';

    // 3. Form participants map based on server-side profiles
    const participants = [
      {
        uid: callerId,
        role: 'caller' as const,
        displayName: caller.name || 'Caller',
        sourceLocale: callerLang,
        targetLocale: receiverLang, 
        captionsEnabled: true,
      },
      {
        uid: receiverId,
        role: 'callee' as const,
        displayName: receiver.name || 'Receiver',
        sourceLocale: receiverLang,
        targetLocale: callerLang,
        captionsEnabled: true,
      }
    ];

    const translationRef = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);
    const existingSnap = await translationRef.get();

    if (!existingSnap.exists) {
      const initialDoc = buildInitialTranslationDoc({
        callId,
        callStatus: call.status ?? 'accepted',
        roomName: roomName ?? null,
        dailyRoomUrl: roomUrl ?? null,
        participants,
      });

      await translationRef.set({
        ...initialDoc,
        createdAt: FieldValue.serverTimestamp(),
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        status: 'starting',
        botStatus: 'joining',
      });
    }

    // Start the worker (Mock or real)
    try {
      await startWorkerTranslationSession({
        callId,
        roomName: roomName ?? null,
        dailyRoomUrl: roomUrl ?? null,
        participants,
      });
    } catch (workerError) {
      console.error('Worker failed to start, but continuing session creation:', workerError);
    }

    const savedSnap = await translationRef.get();

    return NextResponse.json({
      ok: true,
      callId,
      translation: savedSnap.data(),
    });
  } catch (error) {
    console.error('[translation/start] failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
