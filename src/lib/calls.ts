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

export async function startVideoCall(app: FirebaseApp, receiverId: string): Promise<StartCallResult> {
  const functions = getFunctions(app, 'us-central1');

  const startCall = httpsCallable<{ receiverId: string }, StartCallResult>(functions, 'startCall');

  const res = await startCall({ receiverId });
  const data = res.data;

  if (!data?.roomUrl || !data?.token) {
    throw new Error('startCall did not return roomUrl or token');
  }

  const urlWithToken = `${data.roomUrl}?t=${encodeURIComponent(data.token)}`;
  window.open(urlWithToken, '_blank', 'noopener,noreferrer');

  return data;
}
