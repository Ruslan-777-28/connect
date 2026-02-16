'use client';

import { useEffect, useRef } from 'react';
import { useFirebaseApp, useUser } from '@/firebase';
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

type AcceptCallResult = {
  roomName: string;
  roomUrl: string;
  token: string;
}

export function IncomingCallManager() {
  const { user, isUserLoading } = useUser();
  const app = useFirebaseApp();

  const handlingRef = useRef(false);

  useEffect(() => {
    if (isUserLoading || !user?.uid || !app) return;

    const db = getFirestore(app);
    const functions = getFunctions(app, 'us-central1');

    const q = query(
      collection(db, 'calls'),
      where('receiverId', '==', user.uid),
      where('status', '==', 'ringing'),
      limit(1)
    );

    const unsub = onSnapshot(q, async (snap) => {
      if (handlingRef.current) return;

      const docSnap = snap.docs[0];
      if (!docSnap) return;

      const callId = docSnap.id;
      const call = docSnap.data();

      handlingRef.current = true;

      try {
        const ok = window.confirm(
          `Incoming video call\n\nFrom: ${
            call.callerId
          }\nRole: ${call.callerActingAs ?? 'unknown'}\n\nAccept?`
        );

        if (ok) {
          const acceptCall = httpsCallable< { callId: string }, AcceptCallResult>(functions, 'acceptCall');
          const res = await acceptCall({ callId });
          const { roomUrl, token } = res.data;

          if (roomUrl && token) {
            sessionStorage.setItem(`dailyToken:${callId}`, token);
            sessionStorage.setItem(`dailyRoomUrl:${callId}`, roomUrl);
            // Open the redirect page, which will then open the Daily URL
            window.open(`/call/${callId}`, '_blank', 'noopener,noreferrer');
          } else {
            alert('Accepted, but join URL info is missing.');
          }
        } else {
          const endCall = httpsCallable(functions, 'endCall');
          await endCall({ callId, reason: 'declined' });
        }
      } catch (e: any) {
        console.error('IncomingCallManager error:', e);
        alert(e?.message ?? 'Incoming call error');
      } finally {
        setTimeout(() => {
          handlingRef.current = false;
        }, 800);
      }
    });

    return () => unsub();
  }, [app, user?.uid, isUserLoading]);

  return null;
}
