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

export async function startVideoCall(app: FirebaseApp, receiverId: string): Promise<{ callId: string }> {
  const functions = getFunctions(app, 'us-central1');

  const startCall = httpsCallable<{ receiverId: string }, StartCallResult>(functions, 'startCall');

  const res = await startCall({ receiverId });
  const data = res.data;

  if (!data?.callId || !data?.token) {
    throw new Error('startCall did not return callId/token');
  }

  // The token is NOT written to Firestore. It is held locally.
  // The key is tied to the callId.
  sessionStorage.setItem(`dailyToken:${data.callId}`, data.token);
  sessionStorage.setItem(`dailyRoomUrl:${data.callId}`, data.roomUrl);

  return { callId: data.callId };
}
