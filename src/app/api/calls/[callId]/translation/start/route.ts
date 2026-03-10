
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import { adminDb } from '@/lib/firebase/admin';
import { buildInitialTranslationDoc } from '@/lib/translation/firestore';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * API route to initialize a translation session for a specific call.
 * Pure server-side session activation (browser-led architecture).
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

    // 1. Fetch the call document
    const callSnap = await adminDb.collection('calls').doc(callId).get();
    if (!callSnap.exists) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }
    const call = callSnap.data()!;
    const { callerId, receiverId, roomName, roomUrl, translationEnabled, transcriptEnabled } = call;

    // 2. Fetch user profiles for language preferences
    const [callerSnap, receiverSnap] = await Promise.all([
      adminDb.collection('users').doc(callerId).get(),
      adminDb.collection('users').doc(receiverId).get(),
    ]);

    const callerData = callerSnap.data() || {};
    const receiverData = receiverSnap.data() || {};

    const callerLang = callerData.preferredLanguage || 'uk-UA';
    const receiverLang = receiverData.preferredLanguage || 'en-US';

    console.info(`[translation/start] Call ${callId} initialization:`, {
      caller: { id: callerId, lang: callerLang, fromDb: callerData.preferredLanguage },
      receiver: { id: receiverId, lang: receiverLang, fromDb: receiverData.preferredLanguage }
    });

    // 3. Construct participants array
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

    // NEW ARCHITECTURE: Direct 'active' status, 'disabled' botStatus
    // We no longer call the worker because clients handle recognition
    await translationRef.set({
      ...initialDoc,
      enabled: translationEnabled ?? true,
      transcriptEnabled: transcriptEnabled ?? false,
      createdAt: FieldValue.serverTimestamp(),
      startedAt: FieldValue.serverTimestamp(),
      activatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      status: 'active',
      botStatus: 'disabled', 
    });

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
