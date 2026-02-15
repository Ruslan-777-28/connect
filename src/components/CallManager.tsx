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
import { useRouter } from 'next/navigation';

export function CallManager() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const router = useRouter();

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

  const activeCallsAsCalleeQuery = useMemoFirebase(
    () =>
      user
        ? query(
            collection(firestore, 'calls'),
            where('receiverUid', '==', user.uid),
            where('status', '==', 'accepted')
          )
        : null,
    [user, firestore]
  );
  const { data: activeCallsAsCallee } = useCollection<Call>(
    activeCallsAsCalleeQuery
  );

  const activeCallsAsCallerQuery = useMemoFirebase(
    () =>
      user
        ? query(
            collection(firestore, 'calls'),
            where('callerUid', '==', user.uid),
            where('status', '==', 'accepted')
          )
        : null,
    [user, firestore]
  );
  const { data: activeCallsAsCaller } = useCollection<Call>(
    activeCallsAsCallerQuery
  );
  
  useEffect(() => {
    const fetchCallerProfile = async (call: Call) => {
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
    const allActiveCalls = [...(activeCallsAsCallee || []), ...(activeCallsAsCaller || [])];
    const currentActiveCall = allActiveCalls[0];

    if (currentActiveCall) {
        const otherPartyUid = user?.uid === currentActiveCall.callerUid ? currentActiveCall.receiverUid : currentActiveCall.callerUid;
        const fetchOtherPartyProfile = async (call: Call) => {
            const userRef = doc(firestore, 'users', otherPartyUid);
            const userSnap = await getDoc(userRef);
            if(userSnap.exists()){
                return {...call, caller: userSnap.data() as UserProfile}
            }
            return call;
        }
        fetchOtherPartyProfile(currentActiveCall).then(callWithProfile => {
            setActiveCall(callWithProfile);
            setIncomingCall(null);

            if (callWithProfile.status === 'accepted' && callWithProfile.roomUrl) {
                router.push(`/call/${callWithProfile.id}`);
            }
        })
    } else {
        setActiveCall(null);
    }
  }, [activeCallsAsCallee, activeCallsAsCaller, firestore, user?.uid, router]);

  if (incomingCall) {
    return <IncomingCallToast call={incomingCall} />;
  }

  if (activeCall) {
    return <ActiveCallBar call={activeCall} />;
  }

  return null;
}
