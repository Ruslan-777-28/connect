'use server';

import { generateFirebaseConfig } from '@/ai/flows/generate-firebase-config';
import { initializeFirebase } from '@/firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
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

export async function respondToCallAction(callId: string, action: 'accept' | 'decline' | 'end') {
    const uid = await getUidFromHttpRequest();
    const { firestore } = initializeFirebase();
    const callRef = doc(firestore, 'calls', callId);

    await runTransaction(firestore, async (transaction) => {
        const callDoc = await transaction.get(callRef);
        if (!callDoc.exists()) {
            throw new Error("Call not found.");
        }
        
        const callData = callDoc.data();
        const isCaller = callData.callerUid === uid;
        const isReceiver = callData.receiverUid === uid;
        
        if (!isCaller && !isReceiver) {
            throw new Error("You are not authorized to perform this action on this call.");
        }
        
        let nextStatus = callData.status;

        switch(action) {
            case 'accept':
                if (!isReceiver) throw new Error("Only the recipient can accept a call.");
                if (callData.status !== 'ringing') throw new Error("Call is not ringing or has already been answered.");
                nextStatus = 'accepted';
                break;
            case 'decline':
                if (!isReceiver) throw new Error("Only the recipient can decline a call.");
                if (callData.status !== 'ringing') throw new Error("Call is not ringing or has already been answered.");
                nextStatus = 'ended';
                break;
            case 'end':
                nextStatus = 'ended';
                break;
            default:
                throw new Error("Invalid action.");
        }
        
        if (nextStatus !== callData.status) {
            transaction.update(callRef, {
                status: nextStatus,
                updatedAt: serverTimestamp()
            });
        }
    });

    return { ok: true };
}
