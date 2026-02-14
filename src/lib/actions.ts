'use server';

import { generateFirebaseConfig } from '@/ai/flows/generate-firebase-config';
import { initializeFirebase } from '@/firebase';
import { addDoc, collection, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { headers } from 'next/headers';
import { admin } from './firebase-admin';
import fetch from 'node-fetch';

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

  try {
    const DAILY_API_KEY = process.env.DAILY_API_KEY;
    if (!DAILY_API_KEY) {
        throw new Error("DAILY_API_KEY is not set in the environment variables.");
    }
    
    const response = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DAILY_API_KEY}`,
        },
        body: JSON.stringify({
          properties: {
            enable_chat: true,
            enable_screenshare: true,
            start_audio_off: false,
            start_video_off: false,
          },
        }),
      });

    const room = await response.json() as { url?: string, error?: string };

    if (!response.ok || !room.url) {
      console.error("Daily.co API error:", room);
      throw new Error(room?.error || "Failed to create Daily.co room");
    }

    await updateDoc(callRef, {
        roomUrl: room.url,
        updatedAt: serverTimestamp(),
    });

  } catch(error) {
    await updateDoc(callRef, {
        status: 'ended',
        updatedAt: serverTimestamp()
    }).catch(updateError => console.error("Failed to update call status after room creation failure:", updateError));
    throw error;
  }
  
  return { callId: callRef.id };
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
        const isCallee = callData.calleeUid === uid;
        
        if (!isCaller && !isCallee) {
            throw new Error("You are not authorized to perform this action on this call.");
        }
        
        let nextStatus = callData.status;

        switch(action) {
            case 'accept':
                if (!isCallee) throw new Error("Only the recipient can accept a call.");
                if (callData.status !== 'ringing') throw new Error("Call is not ringing or has already been answered.");
                nextStatus = 'accepted';
                break;
            case 'decline':
                if (!isCallee) throw new Error("Only the recipient can decline a call.");
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
