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
    // This logic is now mostly handled by startVideoCall (for the caller)
    // and IncomingCallManager (for the receiver), which use window.open.
    // The previous redirection logic is disabled to prevent conflicts.
    // This component could be repurposed later for "re-join" functionality
    // or if the window.open flow is replaced with in-app navigation.
    const allActiveCalls = [
      ...(activeCallsAsCaller || []),
      ...(activeCallsAsReceiver || []),
    ];
    const currentCall = allActiveCalls.find(c => c.status === 'accepted');

    if (currentCall) {
      // If the user is in the app, but not on the call page, maybe we want to show a "Return to call" banner.
      // For now, this is disabled to avoid interference with the window.open flow.
      // if (pathname !== `/call/${currentCall.id}`) {
      //   console.log("Active call detected, but not redirecting.", currentCall.id);
      // }
    }
    
  }, [activeCallsAsCaller, activeCallsAsReceiver, user?.uid, router, pathname]);

  return null;
}
