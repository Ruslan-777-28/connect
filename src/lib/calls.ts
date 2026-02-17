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

  // Use httpsCallable to interact with the 'startCall' Firebase Function.
  // This is the correct way to call a Callable Function, avoiding CORS issues
  // and handling authentication tokens automatically.
  const startCall = httpsCallable<{ receiverId: string }, StartCallResult>(functions, 'startCall');

  const res = await startCall({ receiverId });

  // The 'data' property of the result contains the object returned by the function.
  // The Firebase SDK handles throwing an error if the call fails on the backend.
  return res.data;
}
