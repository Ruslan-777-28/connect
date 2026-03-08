
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import { adminDb } from '@/lib/firebase/admin';
import { buildInitialTranslationDoc } from '@/lib/translation/firestore';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';
import { startWorkerTranslationSession } from '@/lib/translation/worker-client';

/**
 * API route to initialize a translation session for a specific call.
 * It fetches participant language preferences directly from their profiles.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> },
) {
  try {
    const { callId } = await context.params;

    if (!callId) {
      return NextResponse.json({ error: 'Missing callId' }, { status: 400 });
    }

    // 1. Fetch the call document to get participant IDs and flags
    const callSnap = await adminDb.collection('calls').doc(callId).get();
    if (!callSnap.exists) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }
    const call = callSnap.data()!;
    const { callerId, receiverId, roomName, roomUrl, translationEnabled, transcriptEnabled } = call;

    // 2. Fetch user profiles to get their preferred languages
    const [callerSnap, receiverSnap] = await Promise.all([
      adminDb.collection('users').doc(callerId).get(),
      adminDb.collection('users').doc(receiverId).get(),
    ]);

    const callerData = callerSnap.data() || {};
    const receiverData = receiverSnap.data() || {};

    // Determine locales with fallbacks
    const callerLang = callerData.preferredLanguage || 'uk-UA';
    const receiverLang = receiverData.preferredLanguage || 'en-US';

    // 3. Construct participants array for the helper
    const participants = [
      {
        uid: callerId,
        role: 'caller' as const,
        displayName: callerData.name || 'Caller',
        sourceLocale: callerLang,
        targetLocale: receiverLang, 
        captionsEnabled: true,
      },
      {
        uid: receiverId,
        role: 'callee' as const,
        displayName: receiverData.name || 'Receiver',
        sourceLocale: receiverLang,
        targetLocale: callerLang,
        captionsEnabled: true,
      }
    ];

    const translationRef = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);
    
    // 4. Build and save the translation master document
    const initialDoc = buildInitialTranslationDoc({
      callId,
      callStatus: call.status ?? 'accepted',
      roomName: roomName ?? null,
      dailyRoomUrl: roomUrl ?? null,
      participants,
    });

    await translationRef.set({
      ...initialDoc,
      enabled: translationEnabled ?? true,
      transcriptEnabled: transcriptEnabled ?? false,
      createdAt: FieldValue.serverTimestamp(),
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      status: 'starting',
      botStatus: 'joining',
    });

    // 5. Notify the background worker (if configured)
    try {
      await startWorkerTranslationSession({
        callId,
        roomName: roomName ?? null,
        dailyRoomUrl: roomUrl ?? null,
        participants,
      });
    } catch (workerError) {
      console.error('Worker failed to start, but session document created:', workerError);
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
