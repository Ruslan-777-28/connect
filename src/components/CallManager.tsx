'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Call } from '@/lib/types';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { getFunctions, httpsCallable } from 'firebase/functions';

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

  // Incoming calls for receiver (status = ringing)
  const incomingCallsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, 'calls'),
      where('receiverId', '==', user.uid),
      where('status', '==', 'ringing')
    );
  }, [user, firestore]);

  const { data: incomingCalls } = useCollection<Call>(incomingCallsQuery);

  useEffect(() => {
    if (!user) return;
    if (!incomingCalls || incomingCalls.length === 0) return;

    const call = incomingCalls[0] as any;
    const callId: string | undefined = call?.id;
    if (!callId) return;

    if (pathname === `/call/${callId}`) return;
    if (shownCallIdsRef.current.has(callId)) return;
    shownCallIdsRef.current.add(callId);

    const callerName = (call?.callerName as string) || 'Someone';

    const accept = async () => {
      try {
        setBusyCallId(callId);

        const functions = getFunctions(app, 'us-central1');
        const acceptCall = httpsCallable<{ callId: string }, AcceptCallResult>(functions, 'acceptCall');

        const res = await acceptCall({ callId });
        const data = res.data;

        if (!data?.token || !data?.roomUrl) {
          throw new Error('acceptCall did not return token/roomUrl');
        }

        const urlWithToken = `${data.roomUrl}?t=${encodeURIComponent(data.token)}`;
        window.open(urlWithToken, '_blank', 'noopener,noreferrer');

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
      try {
        setBusyCallId(callId);

        const functions = getFunctions(app, 'us-central1');
        const endCall = httpsCallable<{ callId: string; reason: string }, EndCallResult>(functions, 'endCall');

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
          <Button size="sm" variant="outline" onClick={decline} disabled={busyCallId === callId}>
            Decline
          </Button>
        </div>
      ),
    });
  }, [incomingCalls, user, pathname, router, toast, app, busyCallId]);

  return null;
}
