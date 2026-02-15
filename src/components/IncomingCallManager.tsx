'use client';

import { useEffect, useRef } from 'react';
import { useUser, useFirestore, useFirebaseApp } from '@/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

export function IncomingCallManager() {
  const { user } = useUser();
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const handlingRef = useRef(false);

  useEffect(() => {
    if (!user?.uid || !firestore || !app) return;

    const q = query(
      collection(firestore, 'calls'),
      where('receiverUid', '==', user.uid),
      where('status', '==', 'ringing'),
      limit(1)
    );

    const unsub = onSnapshot(q, async (snap) => {
      if (handlingRef.current) return;

      const docSnap = snap.docs[0];
      if (!docSnap) return;

      const callId = docSnap.id;
      const call = docSnap.data();

      // простий анти-дубль, щоб не відкривало 10 разів
      handlingRef.current = true;

      try {
        const ok = window.confirm(
          `Incoming video call from ${call.callerUid}\n\nAccept?`
        );

        const functions = getFunctions(app, 'us-central1');

        if (ok) {
          const acceptCall = httpsCallable(functions, 'acceptCall');
          const res: any = await acceptCall({ callId });
          const roomUrl = res.data?.roomUrl;
          if (roomUrl) {
            window.open(roomUrl, '_blank', 'noopener,noreferrer');
          }
        } else {
          const endCall = httpsCallable(functions, 'endCall');
          await endCall({ callId, reason: 'declined' });
        }
      } finally {
        // даємо змогу приймати наступні дзвінки
        setTimeout(() => {
          handlingRef.current = false;
        }, 1000);
      }
    });

    return () => unsub();
  }, [user, firestore, app]);

  return null;
}
