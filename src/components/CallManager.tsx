'use client';

import { useMemo, useEffect } from 'react';
import {
  useUser,
  useFirestore,
  useCollection,
  useMemoFirebase,
} from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Call } from '@/lib/types';
import { usePathname, useRouter } from 'next/navigation';

export function CallManager() {
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const pathname = usePathname();

  const activeCallsAsCallerQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, 'calls'),
      where('callerUid', '==', user.uid),
      where('status', 'in', ['ringing', 'accepted'])
    );
  }, [user, firestore]);

  const activeCallsAsReceiverQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, 'calls'),
      where('receiverUid', '==', user.uid),
      where('status', '==', 'accepted') // Receiver only sees accepted calls as "active"
    );
  }, [user, firestore]);

  const { data: activeCallsAsCaller } =
    useCollection<Call>(activeCallsAsCallerQuery);
  const { data: activeCallsAsReceiver } =
    useCollection<Call>(activeCallsAsReceiverQuery);

  useEffect(() => {
    const allActiveCalls = [
      ...(activeCallsAsCaller || []),
      ...(activeCallsAsReceiver || []),
    ];
    const currentCall = allActiveCalls.sort(
      (a, b) =>
        (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)
    )[0];

    if (currentCall) {
      if (pathname === `/call/${currentCall.id}`) {
        // Already on the call page, do nothing.
        return;
      }

      if (currentCall.status === 'accepted') {
        router.push(`/call/${currentCall.id}`);
      } else if (
        currentCall.status === 'ringing' &&
        user?.uid === currentCall.callerUid
      ) {
        // The caller initiated and should be redirected to the waiting page
        router.push(`/call/${currentCall.id}`);
      }
    }
  }, [activeCallsAsCaller, activeCallsAsReceiver, user?.uid, router, pathname]);

  // This component no longer renders UI, it only handles redirection.
  // Incoming call UI is handled by IncomingCallManager.
  return null;
}
