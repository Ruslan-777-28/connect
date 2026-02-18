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

function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function openDaily(urlWithToken: string, callWindow?: Window | null) {
  const mobile = isMobileBrowser();

  if (mobile) {
    // Mobile Chrome/Safari: safest, no popups
    window.location.replace(urlWithToken);
    return null;
  }

  const w = callWindow ?? window.open('about:blank', '_blank');
  if (!w) return null;

  try {
    w.opener = null;
  } catch {}
  w.location.replace(urlWithToken);
  return w;
}


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

    // Lifecycle tracking is removed from here
    return { callId };
  } catch (error) {
    // No window to close here anymore
    throw error;
  }
}
