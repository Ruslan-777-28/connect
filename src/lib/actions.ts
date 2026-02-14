'use server';

import { generateFirebaseConfig } from '@/ai/flows/generate-firebase-config';
import { initializeFirebase } from '@/firebase';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { headers } from 'next/headers';
import { admin } from './firebase-admin';

async function getUidFromHttpRequest() {
    const authHeader = headers().get("authorization") || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) throw new Error("Missing Bearer token");
    const idToken = match[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    return decoded.uid;
}


export async function generateFirebaseConfigAction() {
  try {
    const result = await generateFirebaseConfig({});
    return { success: true, data: result.config };
  } catch (error) {
    console.error(error);
    return { success: false, error: 'Failed to generate Firebase config.' };
  }
}

export async function startCallAction(calleeUid: string) {
  const callerUid = await getUidFromHttpRequest();
  
  if (!calleeUid) throw new Error("calleeUid required");
  if (calleeUid === callerUid) throw new Error("Cannot call yourself");

  const { firestore } = initializeFirebase();
  const callRef = await addDoc(collection(firestore, 'calls'), {
    callerUid,
    calleeUid,
    status: 'ringing',
    roomUrl: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  return { callId: callRef.id };
}

export async function respondToCallAction(callId: string, action: 'accept' | 'decline' | 'end') {
    const uid = await getUidFromHttpRequest();
    const { firestore } = initializeFirebase();
    const callRef = doc(firestore, 'calls', callId);

    // This is a simplified version of the transaction logic.
    // A full implementation would use a transaction to read and then write.
    const validActions = ["accept", "decline", "end"];
    if (!validActions.includes(action)) {
        throw new Error("Invalid action");
    }

    let nextStatus: 'accepted' | 'ended' = 'ended';
    if (action === 'accept') {
        nextStatus = 'accepted';
    }

    await updateDoc(callRef, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
    });

    return { ok: true };
}
