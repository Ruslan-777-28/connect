'use client';

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import type { FirebaseApp } from 'firebase/app';
import type { Call } from '@/lib/types';

type StartCallResult = {
  callId: string;
  roomName: string;
  roomUrl: string;
  token: string;
  receiverId: string;
};

async function endCallClient(app: FirebaseApp, callId: string, reason: string) {
  try {
    const functions = getFunctions(app, 'us-central1');
    const endCall = httpsCallable(functions, 'endCall');
    await endCall({ callId, reason });
  } catch (error) {
    console.error(`Failed to end call ${callId} with reason ${reason}:`, error);
  }
}

export async function startVideoCall(
  app: FirebaseApp,
  receiverId: string
): Promise<{ callId: string }> {
  const functions = getFunctions(app, 'us-central1');
  const firestore = getFirestore(app);

  const startCall = httpsCallable<{ receiverId: string }, StartCallResult>(
    functions,
    'startCall'
  );

  const res = await startCall({ receiverId });
  const data = res.data;

  if (!data?.callId || !data?.token) {
    throw new Error('startCall did not return callId or token');
  }

  const { callId, roomUrl, token } = data;

  const urlWithToken = `${roomUrl}?t=${encodeURIComponent(token)}`;
  const callWindow = window.open(urlWithToken, '_blank', 'noopener,noreferrer');

  let unsubscribe: Unsubscribe | null = null;
  let missedTimeout: NodeJS.Timeout | null = null;
  let closedCheckInterval: NodeJS.Timeout | null = null;

  const cleanup = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (missedTimeout) {
      clearTimeout(missedTimeout);
      missedTimeout = null;
    }
    if (closedCheckInterval) {
      clearInterval(closedCheckInterval);
      closedCheckInterval = null;
    }
  };

  const callDocRef = doc(firestore, 'calls', callId);

  unsubscribe = onSnapshot(callDocRef, (snapshot) => {
    const callData = snapshot.data() as Call;
    if (callData?.status === 'accepted' || callData?.status === 'ended') {
      if (missedTimeout) {
        clearTimeout(missedTimeout);
        missedTimeout = null;
      }
      if (callData?.status === 'ended') {
        cleanup();
      }
    }
  });

  missedTimeout = setTimeout(() => {
    endCallClient(app, callId, 'missed');
    cleanup();
  }, 45000);

  closedCheckInterval = setInterval(async () => {
    if (callWindow?.closed) {
      await endCallClient(app, callId, 'caller_closed_tab');
      cleanup();
    }
  }, 1000);

  return { callId };
}
