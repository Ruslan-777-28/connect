
'use client';

import { getFunctions, httpsCallable } from 'firebase/functions';
import type { FirebaseApp } from 'firebase/app';

type StartCallResult = {
  callId: string;
  roomName: string;
  roomUrl: string;
  token: string;
  receiverId: string;
  offerId: string;
};

export async function endCallClient(
  app: FirebaseApp,
  callId: string,
  reason: string
) {
  try {
    const functions = getFunctions(app, 'us-central1');
    const endCall = httpsCallable<
      { callId: string; reason?: string },
      { ok: true; alreadyEnded?: true }
    >(functions, 'endCall');
    await endCall({ callId, reason });
  } catch (error) {
    console.error(`Failed to end call ${callId} with reason ${reason}:`, error);
  }
}

export async function startVideoCall(
  app: FirebaseApp,
  receiverId: string,
  offerId: string
): Promise<{ callId: string }> {
  try {
    const functions = getFunctions(app, 'us-central1');

    const startCall = httpsCallable<{ receiverId: string, offerId: string }, StartCallResult>(
      functions,
      'startCall'
    );

    const res = await startCall({ receiverId, offerId });
    const data = res.data;

    if (!data?.callId || !data?.token || !data?.roomUrl) {
      throw new Error('startCall did not return required data');
    }

    const { callId, roomUrl, token } = data;

    sessionStorage.setItem(`dailyToken:${callId}`, token);
    sessionStorage.setItem(`dailyRoomUrl:${callId}`, roomUrl);

    return { callId };
  } catch (error: any) {
    // Standardize error codes based on server responses
    if (error?.code === 'not-found' && error?.message === 'OFFER_NOT_FOUND') {
      throw new Error('OFFER_NOT_FOUND');
    }
    if (error?.code === 'failed-precondition' && error?.message === 'INSUFFICIENT_BALANCE') {
      throw new Error('INSUFFICIENT_BALANCE');
    }
    
    throw error;
  }
}
