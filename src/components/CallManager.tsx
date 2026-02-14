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

export function CallManager() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);

  const incomingCallsQuery = useMemoFirebase(
    () =>
      user
        ? query(
            collection(firestore, 'calls'),
            where('calleeUid', '==', user.uid),
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
            where('calleeUid', '==', user.uid),
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
    const activeCall = activeCallsAsCallee?.[0] || activeCallsAsCaller?.[0];
    if (activeCall) {
        const otherPartyUid = user?.uid === activeCall.callerUid ? activeCall.calleeUid : activeCall.callerUid;
        const fetchOtherPartyProfile = async (call: Call) => {
            const userRef = doc(firestore, 'users', otherPartyUid);
            const userSnap = await getDoc(userRef);
            if(userSnap.exists()){
                return {...call, caller: userSnap.data() as UserProfile}
            }
            return call;
        }
        fetchOtherPartyProfile(activeCall).then(callWithProfile => {
            setActiveCall(callWithProfile);
            setIncomingCall(null);
        })
    } else {
        setActiveCall(null);
    }
  }, [activeCallsAsCallee, activeCallsAsCaller, firestore, user?.uid]);

  if (incomingCall) {
    return <IncomingCallToast call={incomingCall} />;
  }

  if (activeCall) {
    return <ActiveCallBar call={activeCall} />;
  }

  return null;
}
