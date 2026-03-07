import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import { adminDb } from '@/lib/firebase/admin';
import { buildInitialTranslationDoc } from '@/lib/translation/firestore';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

interface StartTranslationRequestBody {
  roomName?: string | null;
  dailyRoomUrl?: string | null;
  callStatus?: 'pending' | 'accepted' | 'active' | 'ended' | 'missed';
  participants?: Array<{
    uid: string;
    role: 'caller' | 'callee';
    displayName?: string | null;
    sourceLocale?: string;
    targetLocale?: string;
    captionsEnabled?: boolean;
    audioTranslationEnabled?: boolean;
  }>;
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

    const body = (await request.json().catch(() => ({}))) as StartTranslationRequestBody;

    if (!body.participants || !Array.isArray(body.participants) || body.participants.length === 0) {
      return NextResponse.json(
        { error: 'participants array is required' },
        { status: 400 },
      );
    }

    const translationRef = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);
    const existingSnap = await translationRef.get();

    if (!existingSnap.exists) {
      const initialDoc = buildInitialTranslationDoc({
        callId,
        callStatus: body.callStatus ?? 'accepted',
        roomName: body.roomName ?? null,
        dailyRoomUrl: body.dailyRoomUrl ?? null,
        participants: body.participants,
      });

      await translationRef.set({
        ...initialDoc,
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        status: 'starting',
        botStatus: 'joining',
      });
    } else {
      const participantPatch: Record<string, unknown> = {};

      for (const participant of body.participants) {
        participantPatch[`participants.${participant.uid}`] = {
          uid: participant.uid,
          role: participant.role,
          displayName: participant.displayName ?? null,
          sourceLocale: participant.sourceLocale ?? 'uk-UA',
          targetLocale: participant.targetLocale ?? 'en-US',
          captionsEnabled: participant.captionsEnabled ?? true,
          audioTranslationEnabled: participant.audioTranslationEnabled ?? false,
          joinedAt: null,
          leftAt: null,
          streamStatus: 'idle',
        };
      }

      await translationRef.set(
        {
          enabled: true,
          callId,
          callStatus: body.callStatus ?? 'accepted',
          status: 'starting',
          botStatus: 'joining',
          source: {
            roomName: body.roomName ?? null,
            dailyRoomUrl: body.dailyRoomUrl ?? null,
          },
          startedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          endedAt: null,
          lastError: null,
          ...participantPatch,
        },
        { merge: true },
      );
    }

    const savedSnap = await translationRef.get();

    return NextResponse.json({
      ok: true,
      callId,
      translation: savedSnap.data(),
    });
  } catch (error) {
    console.error('[translation/start] failed:', error);

    return NextResponse.json(
      {
        error: 'Failed to start translation session',
      },
      { status: 500 },
    );
  }
}
