'use client';

import { getFunctions, httpsCallable } from 'firebase/functions';
import type { FirebaseApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';

export function startVideoCall(app: FirebaseApp, receiverUid: string): Promise<{ callId: string }> {
  return new Promise(async (resolve, reject) => {
    try {
      const functions = getFunctions(app, 'us-central1');
      const db = getFirestore(app);

      const createDailyRoom = httpsCallable(functions, 'createDailyRoom');
      const res: any = await createDailyRoom({
        receiverUid,
        callerActingAs: 'client',
      });

      console.log("createDailyRoom response:", res.data);

      const { callId, callerJoinUrl } = res.data as { callId: string; callerJoinUrl: string };

      if (!callerJoinUrl) {
        throw new Error('callerJoinUrl not returned from function.');
      }

      const unsub = onSnapshot(doc(db, 'calls', callId), (snap) => {
        if (!snap.exists()) {
          unsub();
          alert('Call document was unexpectedly deleted.');
          resolve({ callId });
          return;
        }
        const call = snap.data();

        if (call.status === 'accepted') {
          window.open(callerJoinUrl, '_blank', 'noopener,noreferrer');
          unsub();
          resolve({ callId });
        }

        if (['ended', 'expired', 'missed', 'declined'].includes(call.status)) {
          unsub();
          alert(`Call ${call.status}`);
          resolve({ callId });
        }
      });

    } catch (error) {
      reject(error);
    }
  });
}
