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
  const shownCallIdsRef = useRef<Set<string>>(new Set());
  const [busyCallId, setBusyCallId] = useState<string | null>(null);

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
          if (change.type !== 'added') continue;

          const callDoc = change.doc;
          const callId = callDoc.id;

          if (shownCallIdsRef.current.has(callId)) continue;
          shownCallIdsRef.current.add(callId);

          const call = callDoc.data();
          const callerName = (call?.callerName as string) || 'Someone';

          const accept = async () => {
            const mobile = /Android|iPhone|iPad|iPod/i.test(
              navigator.userAgent
            );
            const callWindow = mobile
              ? null
              : window.open('about:blank', '_blank');

            if (!mobile && !callWindow) {
              toast({
                variant: 'destructive',
                title: 'Popup Blocked',
                description: 'Please allow popups and try again.',
              });
              return;
            }

            try {
              if (callWindow) callWindow.opener = null;
            } catch {}

            setBusyCallId(callId);

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
                try {
                  if (callWindow && !callWindow.closed) callWindow.close();
                } catch {}
                return;
              }

              const acceptCall = httpsCallable<
                { callId: string },
                AcceptCallResult
              >(functions, 'acceptCall');
              const res = await acceptCall({ callId });
              const data = res.data;

              if (!data?.token || !data?.roomUrl) {
                try {
                  if (callWindow && !callWindow.closed) callWindow.close();
                } catch {}
                throw new Error('acceptCall did not return token/roomUrl');
              }

              const urlWithToken = `${
                data.roomUrl
              }?t=${encodeURIComponent(data.token)}`;

              const openedWindow = mobile ? null : callWindow;

              if (mobile) {
                window.location.replace(urlWithToken);
              } else if (openedWindow) {
                openedWindow.location.replace(urlWithToken);
              }

              let unsubscribe: Unsubscribe | null = null;
              let closedCheckInterval: ReturnType<
                typeof setInterval
              > | null = null;
              let latestStatus: Call['status'] | null = null;

              const cleanup = () => {
                if (unsubscribe) {
                  unsubscribe();
                  unsubscribe = null;
                }
                if (closedCheckInterval) {
                  clearInterval(closedCheckInterval);
                  closedCheckInterval = null;
                }
              };

              unsubscribe = onSnapshot(
                callDocRef,
                (snapshot) => {
                  const callData = snapshot.data() as Call | undefined;
                  latestStatus = (callData?.status as any) ?? null;
                  if (latestStatus === 'ended') cleanup();
                },
                (err) => {
                  console.error('onSnapshot error:', err);
                  cleanup();
                }
              );

              if (!mobile && openedWindow) {
                const openedAt = Date.now();
                const CLOSE_GRACE_MS = 15_000;

                closedCheckInterval = setInterval(() => {
                  if (latestStatus === 'ended') { cleanup(); return; }
                  if (latestStatus !== 'ringing') return;
                  if (Date.now() - openedAt < CLOSE_GRACE_MS) return;

                  let isClosed: boolean | null = null;
                  try { isClosed = openedWindow.closed; } catch { isClosed = null; }

                  if (isClosed === true) {
                    const endCall = httpsCallable(functions, 'endCall');
                    endCall({ callId, reason: 'receiver_closed_tab' });
                    cleanup();
                  }
                }, 1000);
              }
            } catch (e: any) {
              try {
                if (callWindow && !callWindow.closed) callWindow.close();
              } catch {}
              toast({
                variant: 'destructive',
                title: 'Accept failed',
                description: e.message || 'Could not accept the call.',
              });
              shownCallIdsRef.current.delete(callId);
            } finally {
              setBusyCallId(null);
            }
          };

          const decline = async () => {
            setBusyCallId(callId);
            try {
              const functions = getFunctions(app, 'us-central1');
              const endCall = httpsCallable<
                { callId: string; reason: string },
                EndCallResult
              >(functions, 'endCall');

              await endCall({ callId, reason: 'declined' });

              toast({
                title: 'Call declined',
                description: `You declined the call from ${callerName}.`,
              });
            } catch (e: any) {
              toast({
                variant: 'destructive',
                title: 'Decline failed',
                description: e?.message || 'Could not decline the call.',
              });
              shownCallIdsRef.current.delete(callId);
            } finally {
              setBusyCallId(null);
            }
          };

          toast({
            title: 'Incoming call',
            description: `${callerName} is calling you.`,
            duration: 60_000,
            action: (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={accept}
                  disabled={busyCallId === callId}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={decline}
                  disabled={busyCallId === callId}
                >
                  Decline
                </Button>
              </div>
            ),
          });
        }
      },
      (err) => {
        console.error('Call listener error:', err);
      }
    );

    return () => unsub();
  }, [user?.uid, firestore, app, toast, busyCallId]);

  return activeCallWithCaller ? (
    <ActiveCallBar call={activeCallWithCaller} />
  ) : null;
}
