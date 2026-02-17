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
import { collection, query, where, doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import type { Call, UserProfile } from '@/lib/types';
import { usePathname, useRouter } from 'next/navigation';
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

  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const shownCallIdsRef = useRef<Set<string>>(new Set());
  const [busyCallId, setBusyCallId] = useState<string | null>(null);

  // --- Listen for INCOMING calls (for receiver) ---
  const incomingCallsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, 'calls'),
      where('receiverId', '==', user.uid),
      where('status', '==', 'ringing')
    );
  }, [user, firestore]);
  const { data: incomingCalls } = useCollection<Call>(incomingCallsQuery);

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

  const { data: acceptedAsCaller } = useCollection<Call>(acceptedAsCallerQuery);
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
    if (!user || !incomingCalls || incomingCalls.length === 0) return;

    const call = incomingCalls[0] as any;
    const callId: string | undefined = call?.id;
    if (!callId) return;

    if (pathname === `/call/${callId}` || shownCallIdsRef.current.has(callId)) {
      return;
    }
    shownCallIdsRef.current.add(callId);

    const callerName = (call?.callerName as string) || 'Someone';

    const accept = async () => {
      setBusyCallId(callId);
      try {
        const functions = getFunctions(app, 'us-central1');
        const acceptCall = httpsCallable<{ callId: string }, AcceptCallResult>(functions, 'acceptCall');
    
        const res = await acceptCall({ callId });
        const data = res.data;
    
        if (!data?.token || !data?.roomUrl) {
          throw new Error('acceptCall did not return token/roomUrl');
        }
    
        const urlWithToken = `${data.roomUrl}?t=${encodeURIComponent(data.token)}`;
        const callWindow = window.open(urlWithToken, '_blank', 'noopener,noreferrer');
    
        if (!callWindow) {
          const endCall = httpsCallable(functions, 'endCall');
          await endCall({ callId, reason: 'popup_blocked' });
          throw new Error('Popup was blocked. Please allow popups for this site.');
        }
    
        let unsubscribe: Unsubscribe | null = null;
        let closedCheckInterval: ReturnType<typeof setInterval> | null = null;
        let latestStatus: Call['status'] | null = null;
    
        const cleanup = () => {
          if (unsubscribe) { unsubscribe(); unsubscribe = null; }
          if (closedCheckInterval) { clearInterval(closedCheckInterval); closedCheckInterval = null; }
        };
    
        const callDocRef = doc(firestore, 'calls', callId);
    
        unsubscribe = onSnapshot(
          callDocRef,
          (snapshot) => {
            if (!snapshot.exists()) { latestStatus = null; cleanup(); return; }
            const callData = snapshot.data() as Call | undefined;
            latestStatus = (callData?.status as any) ?? null;
            if (latestStatus === 'ended') cleanup();
          },
          (err) => {
            console.error('onSnapshot error:', err);
            cleanup();
          }
        );
    
        closedCheckInterval = setInterval(() => {
          if (latestStatus === 'ended') return;
          if (callWindow.closed) {
            const endCall = httpsCallable(functions, 'endCall');
            endCall({ callId, reason: 'receiver_closed_tab' });
            cleanup();
          }
        }, 1000);
    
      } catch (e: any) {
        toast({
          variant: 'destructive',
          title: 'Accept failed',
          description: e?.message || 'Could not accept the call.',
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
          <Button size="sm" onClick={accept} disabled={busyCallId === callId}>
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
  }, [incomingCalls, user, pathname, router, toast, app, busyCallId]);

  return activeCallWithCaller ? (
    <ActiveCallBar call={activeCallWithCaller} />
  ) : null;
}
