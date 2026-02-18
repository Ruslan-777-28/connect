'use client';

import { getFunctions, httpsCallable } from 'firebase/functions';
import type { FirebaseApp } from 'firebase/app';

type StartCallResult = {
  callId: string;
  roomName: string;
  roomUrl: string;
  token: string;
  receiverId: string;
};

type EndCallResult = { ok: true; alreadyEnded?: true };

export async function endCallClient(
  app: FirebaseApp,
  callId: string,
  reason: string
) {
  try {
    const functions = getFunctions(app, 'us-central1');
    const endCall = httpsCallable<
      { callId: string; reason?: string },
      EndCallResult
    >(functions, 'endCall');
    await endCall({ callId, reason });
  } catch (error) {
    console.error(`Failed to end call ${callId} with reason ${reason}:`, error);
  }
}

export async function startVideoCall(
  app: FirebaseApp,
  receiverId: string
): Promise<{ callId: string }> {
  try {
    const functions = getFunctions(app, 'us-central1');

    const startCall = httpsCallable<{ receiverId: string }, StartCallResult>(
      functions,
      'startCall'
    );

    const res = await startCall({ receiverId });
    const data = res.data;

    if (!data?.callId || !data?.token || !data?.roomUrl) {
      throw new Error('startCall did not return callId/token/roomUrl');
    }

    const { callId, roomUrl, token } = data;

    // Save to sessionStorage instead of opening a window
    sessionStorage.setItem(`dailyToken:${callId}`, token);
    sessionStorage.setItem(`dailyRoomUrl:${callId}`, roomUrl);

    return { callId };
  } catch (error) {
    throw error;
  }
}
