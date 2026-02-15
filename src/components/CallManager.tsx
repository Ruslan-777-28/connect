'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  useUser,
  useFirestore,
  useCollection,
  useMemoFirebase,
} from '@/firebase';
import { collection, query, where, doc, getDoc } from 'firebase/firestore';
import type { Call, UserProfile } from '@/lib/types';
import { IncomingCallToast } from './IncomingCallToast';
import { ActiveCallBar } from './ActiveCallBar';
import { usePathname, useRouter } from 'next/navigation';

export function CallManager() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const incomingCallsQuery = useMemoFirebase(
    () =>
      user
        ? query(
            collection(firestore, 'calls'),
            where('receiverUid', '==', user.uid),
            where('status', '==', 'ringing')
          )
        : null,
    [user, firestore]
  );

  const { data: incomingCalls } = useCollection<Call>(incomingCallsQuery);

  const activeCallsQuery = useMemoFirebase(() => {
    if (!user) return null;
    const asCaller = query(
      collection(firestore, 'calls'),
      where('callerUid', '==', user.uid),
      where('status', 'in', ['ringing', 'accepted'])
    );
    const asReceiver = query(
      collection(firestore, 'calls'),
      where('receiverUid', '==', user.uid),
      where('status', '==', 'accepted') // Receiver only sees accepted calls as "active"
    );
    // This is not a real query, just a way to manage multiple queries in the hook
    return [asCaller, asReceiver];
  }, [user, firestore]);

  const { data: activeCallsAsCaller } = useCollection<Call>(activeCallsQuery ? activeCallsQuery[0] : null);
  const { data: activeCallsAsReceiver } = useCollection<Call>(activeCallsQuery ? activeCallsQuery[1] : null);

  useEffect(() => {
    const fetchCallerProfile = async (call: Call) => {
      if (!firestore) return call;
      const userRef = doc(firestore, 'users', call.callerUid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        return { ...call, caller: userSnap.data() as UserProfile };
      }
      return call;
    };
    
    if (incomingCalls && incomingCalls.length > 0) {
        fetchCallerProfile(incomingCalls[0]).then(callWithProfile => {
            setIncomingCall(callWithProfile);
            setActiveCall(null);
        });
    } else {
      setIncomingCall(null);
    }
  }, [incomingCalls, firestore]);
  
  useEffect(() => {
    const allActiveCalls = [...(activeCallsAsCaller || []), ...(activeCallsAsReceiver || [])];
    const currentCall = allActiveCalls.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];

    if (currentCall) {
        if (pathname === `/call/${currentCall.id}`) {
          setActiveCall(null);
          return;
        }

        const otherPartyUid = user?.uid === currentCall.callerUid ? currentCall.receiverUid : currentCall.callerUid;
        const fetchOtherPartyProfile = async (call: Call) => {
            if (!firestore) return call;
            const userRef = doc(firestore, 'users', otherPartyUid);
            const userSnap = await getDoc(userRef);
            if(userSnap.exists()){
                return {...call, caller: userSnap.data() as UserProfile}
            }
            return call;
        }

        if (currentCall.status === 'accepted') {
          router.push(`/call/${currentCall.id}`);
          setActiveCall(null);
        } else if (currentCall.status === 'ringing' && user?.uid === currentCall.callerUid) {
          router.push(`/call/${currentCall.id}`);
          setActiveCall(null);
        } else {
          setActiveCall(null);
        }
    } else {
        setActiveCall(null);
    }
  }, [activeCallsAsCaller, activeCallsAsReceiver, firestore, user?.uid, router, pathname]);

  if (incomingCall) {
    return <IncomingCallToast call={incomingCall} />;
  }

  // ActiveCallBar is commented out as the logic now redirects to the call page
  // if (activeCall) {
  //   return <ActiveCallBar call={activeCall} />;
  // }

  return null;
}
