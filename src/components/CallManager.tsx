
'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  useUser,
  useFirestore,
  useCollection,
  useMemoFirebase,
  useFirebaseApp,
  useDoc,
} from '@/firebase';
import {
  collection,
  query,
  where,
  doc,
  onSnapshot,
  Unsubscribe,
  getDoc,
} from 'firebase/firestore';
import type { Call, UserProfile } from '@/lib/types';
import { useToast, toast as pushToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ActiveCallBar } from './ActiveCallBar';

type AcceptCallResult = {
  roomUrl: string;
  roomName: string;
  token: string;
};

type EndCallResult = { ok: true };

export function CallManager() {
  const { user } = useUser();
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const router = useRouter();

  const [busyCallId, setBusyCallId] = useState<string | null>(null);
  const busyCallIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    busyCallIdRef.current = busyCallId;
  }, [busyCallId]);

  const { dismiss } = useToast();
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);

  const incomingToastIdRef = useRef<string | null>(null);
  const activeIncomingCallIdRef = useRef<string | null>(null);
  const activeCallUnsubRef = useRef<Unsubscribe | null>(null);

  const hideIncomingToast = useCallback(() => {
    const id = incomingToastIdRef.current;
    if (id) {
      dismissRef.current(id);
      incomingToastIdRef.current = null;
    }
    activeIncomingCallIdRef.current = null;
    activeCallUnsubRef.current?.();
    activeCallUnsubRef.current = null;
  }, []);

  const watchCallDoc = useCallback(
    (callId: string) => {
      activeCallUnsubRef.current?.(); 
      activeCallUnsubRef.current = onSnapshot(
        doc(firestore, 'calls', callId),
        (snap) => {
          if (!snap.exists() || snap.data()?.status !== 'ringing') {
            hideIncomingToast();
          }
        },
        (err) => {
          console.error(`Error watching call ${callId}:`, err);
          hideIncomingToast();
        }
      );
    },
    [firestore, hideIncomingToast]
  );
  
  useEffect(() => {
    return () => {
      activeCallUnsubRef.current?.();
    };
  }, []);

  // Tracking for active accepted calls (for the bar)
  // We use simpler queries to avoid composite index requirements
  const callerCallsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'calls'), where('callerId', '==', user.uid));
  }, [user, firestore]);

  const receiverCallsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'calls'), where('receiverId', '==', user.uid));
  }, [user, firestore]);

  const { data: callerCalls } = useCollection<Call>(callerCallsQuery);
  const { data: receiverCalls } = useCollection<Call>(receiverCallsQuery);

  const activeCall = useMemo(() => {
    const all = [...(callerCalls || []), ...(receiverCalls || [])];
    return all.find(c => c.status === 'accepted') || null;
  }, [callerCalls, receiverCalls]);

  const callerDocRef = useMemoFirebase(() => 
    activeCall?.callerId ? doc(firestore, 'users', activeCall.callerId) : null,
    [activeCall?.callerId, firestore]
  );
  const { data: callerProfile } = useDoc<UserProfile>(callerDocRef);

  const activeCallWithCaller = useMemo(() => 
    activeCall && callerProfile ? { ...activeCall, caller: callerProfile } : activeCall,
    [activeCall, callerProfile]
  );

  const initializedRef = useRef(false);

  useEffect(() => {
    if (!user?.uid || !firestore) {
      return;
    }

    // SIMPLE QUERY: No status, no orderBy, no limits. Avoids composite indexes.
    const q = query(
      collection(firestore, 'calls'),
      where('receiverId', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        // Skip processing initial snapshot if you want to only show "new" events
      }

      // JS FILTERING & SORTING: Production-safe logic
      const ringingCalls = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Call))
        .filter(d => d.status === 'ringing')
        .sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeB - timeA;
        });

      const topRingingCall = ringingCalls[0];

      if (!topRingingCall) {
        hideIncomingToast();
        return;
      }

      const callId = topRingingCall.id;

      // Avoid duplicate toasts for the same call ID
      if (activeIncomingCallIdRef.current === callId && incomingToastIdRef.current) {
        return;
      }

      // Hide old toast if we are switching to a newer call or if state changed
      hideIncomingToast();

      const callerName = topRingingCall.callerName || 'Someone';

      const accept = async () => {
        if (busyCallIdRef.current) return;
        busyCallIdRef.current = callId;
        setBusyCallId(callId);
        hideIncomingToast();

        try {
          const functions = getFunctions(app, 'us-central1');
          const callDocRef = doc(firestore, 'calls', callId);

          const snap = await getDoc(callDocRef);
          const current = snap.data() as Call | undefined;
          if (!current || current.status !== 'ringing') {
            pushToast({
              variant: 'destructive',
              title: 'Call no longer available',
              description: 'This call has already ended.',
            });
            return;
          }

          const acceptCall = httpsCallable<{ callId: string }, AcceptCallResult>(functions, 'acceptCall');
          const res = await acceptCall({ callId });
          const data = res.data;

          if (!data?.token || !data?.roomUrl) {
            throw new Error('acceptCall did not return token/roomUrl');
          }

          sessionStorage.setItem(`dailyToken:${callId}`, data.token);
          sessionStorage.setItem(`dailyRoomUrl:${callId}`, data.roomUrl);
          router.push(`/call/${callId}`);
          
        } catch (e: any) {
          pushToast({
            variant: 'destructive',
            title: 'Accept failed',
            description: e.message || 'Could not accept the call.',
          });
        } finally {
          busyCallIdRef.current = null;
          setBusyCallId(null);
        }
      };

      const decline = async () => {
        if (busyCallIdRef.current) return;
        busyCallIdRef.current = callId;
        setBusyCallId(callId);
        hideIncomingToast();

        try {
          const functions = getFunctions(app, 'us-central1');
          const endCall = httpsCallable<{ callId: string; reason: string }, EndCallResult>(functions, 'endCall');
          await endCall({ callId, reason: 'declined' });
        } catch (e: any) {
          pushToast({
            variant: 'destructive',
            title: 'Decline failed',
            description: e?.message || 'Could not decline the call.',
          });
        } finally {
          busyCallIdRef.current = null;
          setBusyCallId(null);
        }
      };
      
      const { id: toastId } = pushToast({
        title: 'Incoming call',
        description: `${callerName} is calling you.`,
        duration: Infinity,
        action: (
          <div className="flex gap-2">
            <Button size="sm" onClick={accept} disabled={!!busyCallIdRef.current}>Accept</Button>
            <Button size="sm" variant="outline" onClick={decline} disabled={!!busyCallIdRef.current}>Decline</Button>
          </div>
        ),
      });

      incomingToastIdRef.current = toastId;
      activeIncomingCallIdRef.current = callId;
      watchCallDoc(callId);
    }, (err) => {
      console.error('Call listener error:', err);
    });

    return () => unsub();
  }, [user?.uid, firestore, app, watchCallDoc, hideIncomingToast, router]);

  return activeCallWithCaller ? <ActiveCallBar call={activeCallWithCaller} /> : null;
}
