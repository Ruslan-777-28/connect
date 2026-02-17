'use client';

import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  getFirestore,
  doc,
  onSnapshot,
  Unsubscribe,
  getDoc,
} from 'firebase/firestore';
import type { FirebaseApp } from 'firebase/app';
import type { Call } from '@/lib/types';

type StartCallResult = {
  callId: string;
  roomName: string;
  roomUrl: string;
  token: string;
  receiverId: string;
};

type EndCallResult = { ok: true; alreadyEnded?: true };

async function endCallClient(app: FirebaseApp, callId: string, reason: string) {
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
  const functions = getFunctions(app, 'us-central1');
  const firestore = getFirestore(app);

  const callWindow = window.open('', '_blank', 'noopener,noreferrer');

  try {
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
    const urlWithToken = `${roomUrl}?t=${encodeURIComponent(token)}`;

    if (callWindow) {
      callWindow.location.href = urlWithToken;
    } else {
      await endCallClient(app, callId, 'popup_blocked');
      throw new Error('Popup was blocked. Please allow popups for this site.');
    }

    let unsubscribe: Unsubscribe | null = null;
    let missedTimeout: ReturnType<typeof setTimeout> | null = null;
    let closedCheckInterval: ReturnType<typeof setInterval> | null = null;

    let latestStatus: Call['status'] | null = null;

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

    unsubscribe = onSnapshot(
      callDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          latestStatus = null;
          cleanup();
          return;
        }

        const callData = snapshot.data() as Call | undefined;
        latestStatus = (callData?.status as any) ?? null;

        if (latestStatus === 'accepted') {
          if (missedTimeout) {
            clearTimeout(missedTimeout);
            missedTimeout = null;
          }
          return;
        }

        if (latestStatus === 'ended') {
          cleanup();
        }
      },
      (err) => {
        console.error('onSnapshot error:', err);
        cleanup();
      }
    );

    missedTimeout = setTimeout(async () => {
      const snap = await getDoc(callDocRef);
      const current = snap.data() as Call | undefined;

      if (current?.status === 'ringing') {
        await endCallClient(app, callId, 'missed');
      }
    }, 45_000);

    closedCheckInterval = setInterval(() => {
      if (latestStatus === 'ended') {
        cleanup();
        return;
      }
      if (callWindow.closed) {
        endCallClient(app, callId, 'caller_closed_tab');
        cleanup();
      }
    }, 1000);

    return { callId };
  } catch (error) {
    if (callWindow) {
      callWindow.close();
    }
    throw error;
  }
}
