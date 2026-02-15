'use client';

import { getFunctions, httpsCallable } from 'firebase/functions';
import type { FirebaseApp } from 'firebase/app';

/**
 * Initiates a video call by creating a call document in Firestore via a cloud function.
 * The global CallManager component will then detect the new 'ringing' call and handle redirection.
 * @param app The Firebase app instance.
 * @param receiverUid The UID of the user to call.
 */
export async function startVideoCall(app: FirebaseApp, receiverUid: string) {
  const functions = getFunctions(app, 'us-central1');
  const createDailyRoom = httpsCallable(functions, 'createDailyRoom');

  // This will create the call document with status 'ringing'
  await createDailyRoom({
    receiverUid,
    callerActingAs: 'client',
  });
}
