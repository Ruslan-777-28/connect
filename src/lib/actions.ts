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

export async function startCallAction(receiverUid: string) {
  const callerUid = await getUidFromHttpRequest();
  
  if (!receiverUid) throw new Error("receiverUid required");
  if (receiverUid === callerUid) throw new Error("Cannot call yourself");

  const { firestore } = initializeFirebase();
  
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const callRef = await addDoc(collection(firestore, 'calls'), {
    type: "video",
    status: "ringing",
    roomName: "",
    roomUrl: "",
    callerUid,
    receiverUid,
    createdAt: serverTimestamp(),
    expiresAt,
    acceptedAt: null,
    endedAt: null,
    updatedAt: serverTimestamp(),
  });

  try {
    const apiKey = process.env.DAILY_API_KEY;
    if (!apiKey) {
        throw new Error("DAILY_API_KEY is not set in the environment variables.");
    }
    
    const response = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          privacy: "private",
          properties: {
            enable_chat: true,
            enable_screenshare: true,
            start_audio_off: false,
            start_video_off: false,
            exp: Math.floor(expiresAt.getTime() / 1000), 
          },
        }),
      });

    const rawResponse = await response.text();
    const room = JSON.parse(rawResponse);

    if (!response.ok || !room.url || !room.name) {
      console.error("Daily.co API error:", rawResponse);
      throw new Error(room?.error || "Failed to create Daily.co room");
    }

    await updateDoc(callRef, {
        roomUrl: room.url,
        roomName: room.name,
        updatedAt: serverTimestamp(),
    });

    return { callId: callRef.id, roomUrl: room.url };

  } catch(error) {
    await updateDoc(callRef, {
        status: 'ended',
        updatedAt: serverTimestamp()
    }).catch(updateError => console.error("Failed to update call status after room creation failure:", updateError));
    throw error;
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
