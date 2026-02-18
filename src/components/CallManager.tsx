'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
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
  orderBy,
  limit,
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

  const [busyCallId, setBusyCallId] = useState<string | null>(null);
  const busyCallIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    busyCallIdRef.current = busyCallId;
  }, [busyCallId]);

  // --- Safe dismiss handling ---
  const { dismiss } = useToast();
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);

  // --- Toast & Active Call State Refs ---
  const incomingToastIdRef = useRef<string | null>(null);
  const activeIncomingCallIdRef = useRef<string | null>(null);
  const activeCallUnsubRef = useRef<Unsubscribe | null>(null);

  // --- Core Lifecycle Functions ---
  const hideIncomingToast = useCallback(() => {
    if (activeCallUnsubRef.current) {
      activeCallUnsubRef.current();
      activeCallUnsubRef.current = null;
    }
    const id = incomingToastIdRef.current;
    if (id) {
      dismissRef.current(id);
      incomingToastIdRef.current = null;
    }
    activeIncomingCallIdRef.current = null;
  }, [dismissRef]);

  const watchCallDoc = useCallback(
    (callId: string) => {
      activeCallUnsubRef.current?.(); // Unsubscribe from previous if any
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
  
  // --- Global Unmount Cleanup ---
  useEffect(() => {
    return () => {
      activeCallUnsubRef.current?.();
    };
  }, []);

  // --- Listen for ACTIVE calls (for both participants, for ActiveCallBar) ---
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const acceptedAsCallerQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, 'calls'),
      where('callerId', '==', user.uid),
      where('status', '==', 'accepted')
    );
  }, [user, firestore]);

  const acceptedAsReceiverQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, 'calls'),
      where('receiverId', '==', user.uid),
      where('status', '==', 'accepted')
    );
  }, [user, firestore]);

  const { data: acceptedAsCaller } = useCollection<Call>(acceptedAsCallerQuery);
  const { data: acceptedAsReceiver } = useCollection<Call>(acceptedAsReceiverQuery);

  useEffect(() => {
    const allAccepted = [...(acceptedAsCaller || []), ...(acceptedAsReceiver || [])];
    setActiveCall(allAccepted.length > 0 ? allAccepted[0] : null);
  }, [acceptedAsCaller, acceptedAsReceiver]);

  const callerDocRef = useMemoFirebase(() => 
    activeCall?.callerId ? doc(firestore, 'users', activeCall.callerId) : null,
    [activeCall?.callerId, firestore]
  );
  const { data: callerProfile } = useDoc<UserProfile>(callerDocRef);

  const activeCallWithCaller = useMemo(() => 
    activeCall && callerProfile ? { ...activeCall, caller: callerProfile } : activeCall,
    [activeCall, callerProfile]
  );


  // --- Effect for showing INCOMING call toasts ---
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!user?.uid || !firestore) {
      return;
    }

    const q = query(
      collection(firestore, 'calls'),
      where('receiverId', '==', user.uid),
      where('status', '==', 'ringing'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        return;
      }

      for (const change of snap.docChanges()) {
        if (change.type !== 'added') continue;
        
        const callDoc = change.doc;
        const callId = callDoc.id;
        
        if (activeIncomingCallIdRef.current === callId && incomingToastIdRef.current) continue;
        
        const call = callDoc.data();
        const callerName = (call?.callerName as string) || 'Someone';

        // Close previous toast if any
        hideIncomingToast();

        const accept = async () => {
          if (busyCallIdRef.current) return;
          busyCallIdRef.current = callId;
          setBusyCallId(callId);

          hideIncomingToast();

          const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
          const callWindow = mobile ? null : window.open('about:blank', '_blank');

          if (!mobile && !callWindow) {
            pushToast({
              variant: 'destructive',
              title: 'Popup Blocked',
              description: 'Please allow popups and try again.',
            });
            busyCallIdRef.current = null;
            setBusyCallId(null);
            return;
          }
          try { if (callWindow) callWindow.opener = null; } catch {}

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
              try { if (callWindow && !callWindow.closed) callWindow.close(); } catch {}
              return;
            }

            const acceptCall = httpsCallable<{ callId: string }, AcceptCallResult>(functions, 'acceptCall');
            const res = await acceptCall({ callId });
            const data = res.data;

            if (!data?.token || !data?.roomUrl) {
              try { if (callWindow && !callWindow.closed) callWindow.close(); } catch {}
              throw new Error('acceptCall did not return token/roomUrl');
            }

            const urlWithToken = `${data.roomUrl}?t=${encodeURIComponent(data.token)}`;
            const openedWindow = (mobile ? null : callWindow);

            if (mobile) {
              window.location.replace(urlWithToken);
            } else if (openedWindow) {
              openedWindow.location.replace(urlWithToken);
            }
            
          } catch (e: any) {
            try { if (callWindow && !callWindow.closed) callWindow.close(); } catch {}
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
      }
    }, (err) => {
      console.error('Call listener error:', err);
    });

    return () => unsub();
  }, [user?.uid, firestore, app, watchCallDoc, hideIncomingToast]);

  return activeCallWithCaller ? <ActiveCallBar call={activeCallWithCaller} /> : null;
}
