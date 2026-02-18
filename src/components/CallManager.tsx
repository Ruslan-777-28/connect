'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
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
import { useToast } from '@/hooks/use-toast';
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
  const { toast } = useToast();

  const initializedRef = useRef(false);
  const [busyCallId, setBusyCallId] = useState<string | null>(null);

  // --- New Toast Lifecycle ---
  const incomingToastIdRef = useRef<string | null>(null);
  const activeCallUnsub = useRef<Unsubscribe | null>(null);


  // --- Listen for ACTIVE calls (for both participants) ---
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

  const { data: acceptedAsCaller } = useCollection<Call>(
    acceptedAsCallerQuery
  );
  const { data: acceptedAsReceiver } = useCollection<Call>(
    acceptedAsReceiverQuery
  );

  // Combine accepted calls and find the active one
  useEffect(() => {
    const allAccepted = [
      ...(acceptedAsCaller || []),
      ...(acceptedAsReceiver || []),
    ];
    setActiveCall(allAccepted.length > 0 ? allAccepted[0] : null);
  }, [acceptedAsCaller, acceptedAsReceiver]);

  // Fetch caller's profile for the active call bar
  const callerDocRef = useMemoFirebase(
    () =>
      activeCall?.callerId
        ? doc(firestore, 'users', activeCall.callerId)
        : null,
    [activeCall?.callerId, firestore]
  );
  const { data: callerProfile } = useDoc<UserProfile>(callerDocRef);

  const activeCallWithCaller = useMemo(
    () =>
      activeCall && callerProfile
        ? { ...activeCall, caller: callerProfile }
        : activeCall,
    [activeCall, callerProfile]
  );

  const hideIncomingToast = () => {
    if (activeCallUnsub.current) {
      activeCallUnsub.current();
      activeCallUnsub.current = null;
    }
    if (incomingToastIdRef.current) {
      toast.dismiss(incomingToastIdRef.current);
      incomingToastIdRef.current = null;
    }
  };


  // --- Effect for showing INCOMING call toasts ---
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

    const unsub = onSnapshot(
      q,
      (snap) => {
        // First snapshot — skip
        if (!initializedRef.current) {
          initializedRef.current = true;
          return;
        }

        for (const change of snap.docChanges()) {
          if (change.type !== 'added' || incomingToastIdRef.current) continue;

          const callDoc = change.doc;
          const callId = callDoc.id;
          const call = callDoc.data();
          const callerName = (call?.callerName as string) || 'Someone';

          // Watch this specific call to hide toast when status changes
          activeCallUnsub.current = onSnapshot(doc(firestore, 'calls', callId), (docSnap) => {
            if (!docSnap.exists() || docSnap.data()?.status !== 'ringing') {
              hideIncomingToast();
            }
          });

          const accept = async () => {
            if (busyCallId) return;
            setBusyCallId(callId);

            const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            const callWindow = mobile ? null : window.open('about:blank', '_blank');

            if (!mobile && !callWindow) {
              toast({
                variant: 'destructive',
                title: 'Popup Blocked',
                description: 'Please allow popups and try again.',
              });
              setBusyCallId(null);
              hideIncomingToast(); // Explicitly hide on this failure
              return;
            }
            try { if (callWindow) callWindow.opener = null; } catch {}

            try {
              const functions = getFunctions(app, 'us-central1');
              const callDocRef = doc(firestore, 'calls', callId);

              const snap = await getDoc(callDocRef);
              const current = snap.data() as Call | undefined;
              if (!current || current.status !== 'ringing') {
                toast({
                  variant: 'destructive',
                  title: 'Call no longer available',
                  description: 'This call has already ended.',
                });
                try { if (callWindow && !callWindow.closed) callWindow.close(); } catch {}
                // The single-doc listener will handle hiding the toast.
                return;
              }

              const acceptCall = httpsCallable<
                { callId: string },
                AcceptCallResult
              >(functions, 'acceptCall');
              const res = await acceptCall({ callId });
              const data = res.data;

              if (!data?.token || !data?.roomUrl) {
                try { if (callWindow && !callWindow.closed) callWindow.close(); } catch {}
                throw new Error('acceptCall did not return token/roomUrl');
              }

              const urlWithToken = `${data.roomUrl}?t=${encodeURIComponent(data.token)}`;
              if (mobile) {
                window.location.replace(urlWithToken);
              } else if (callWindow) {
                callWindow.location.replace(urlWithToken);
              }

              // On success, the single-doc listener will hide the toast.
              
              if (!mobile && callWindow) {
                let latestStatus: Call['status'] | null = 'ringing';
                let closedCheckInterval: ReturnType<typeof setInterval> | null = null;
                
                const cleanup = () => {
                  if (unsubStatus) unsubStatus();
                  if (closedCheckInterval) clearInterval(closedCheckInterval);
                }

                const unsubStatus = onSnapshot(callDocRef, (s) => {
                  latestStatus = s.data()?.status as Call['status'] ?? null;
                  if (latestStatus !== 'ringing') {
                    cleanup();
                  }
                });
                
                const openedAt = Date.now();
                const CLOSE_GRACE_MS = 15_000;
                
                closedCheckInterval = setInterval(() => {
                  if (latestStatus !== 'ringing') {
                    cleanup();
                    return;
                  }
                  if (Date.now() - openedAt < CLOSE_GRACE_MS) return;

                  let isClosed = false;
                  try { isClosed = callWindow.closed } catch { isClosed = false }
                  
                  if(isClosed) {
                    const endCall = httpsCallable(functions, 'endCall');
                    endCall({ callId, reason: 'receiver_closed_tab' });
                    cleanup();
                  }
                }, 1000);
              }

            } catch (e: any) {
              try { if (callWindow && !callWindow.closed) callWindow.close(); } catch {}
              toast({
                variant: 'destructive',
                title: 'Accept failed',
                description: e.message || 'Could not accept the call.',
              });
              hideIncomingToast();
            } finally {
              setBusyCallId(null);
            }
          };

          const decline = async () => {
            if (busyCallId) return;
            setBusyCallId(callId);
            try {
              const functions = getFunctions(app, 'us-central1');
              const endCall = httpsCallable<
                { callId: string; reason: string },
                EndCallResult
              >(functions, 'endCall');
              await endCall({ callId, reason: 'declined' });
              // The single-doc listener will handle hiding the toast on success.
            } catch (e: any) {
              toast({
                variant: 'destructive',
                title: 'Decline failed',
                description: e?.message || 'Could not decline the call.',
              });
              hideIncomingToast(); // Hide on error
            } finally {
              setBusyCallId(null);
            }
          };

          const { id: toastId } = toast({
            title: 'Incoming call',
            description: `${callerName} is calling you.`,
            duration: Infinity, // Important: toast must be controlled manually
            action: (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={accept}
                  disabled={!!busyCallId}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={decline}
                  disabled={!!busyCallId}
                >
                  Decline
                </Button>
              </div>
            ),
          });
          incomingToastIdRef.current = toastId;
        }
      },
      (err) => {
        console.error('Call listener error:', err);
      }
    );

    return () => {
      unsub();
      hideIncomingToast(); // Also cleanup on main unmount/re-run
    };
  }, [user?.uid, firestore, app, busyCallId, toast]);

  return activeCallWithCaller ? (
    <ActiveCallBar call={activeCallWithCaller} />
  ) : null;
}
