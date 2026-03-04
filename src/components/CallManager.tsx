'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
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
} from 'firebase/firestore';
import type { Call, UserProfile } from '@/lib/types';
import { useToast, toast as pushToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ActiveCallBar } from './ActiveCallBar';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Phone, PhoneOff, Loader2 } from 'lucide-react';

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
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  
  const busyCallIdRef = useRef<string | null>(null);
  useEffect(() => {
    busyCallIdRef.current = busyCallId;
  }, [busyCallId]);

  // Firestore Listeners for active (accepted) calls to show ActiveCallBar
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

  // Main listener for Incoming (Ringing) calls
  useEffect(() => {
    if (!user?.uid || !firestore) {
      return;
    }

    const q = query(
      collection(firestore, 'calls'),
      where('receiverId', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const now = Date.now();
      
      const ringingCalls = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Call))
        .filter(d => d.status === 'ringing')
        .filter(d => !d.expiresAt || d.expiresAt.toMillis() > now)
        .sort((a, b) => {
            const timeA = a.expiresAt?.toMillis?.() || 0;
            const timeB = b.expiresAt?.toMillis?.() || 0;
            return timeB - timeA;
        });
      
      const topRingingCall = ringingCalls[0];
      setIncomingCall(topRingingCall || null);

    }, (err) => {
      console.error('Call listener error:', err);
    });

    return () => unsub();
  }, [user?.uid, firestore]);

  const handleAccept = async () => {
    if (!incomingCall || busyCallIdRef.current) return;
    const callId = incomingCall.id;
    
    setBusyCallId(callId);
    try {
      const functions = getFunctions(app, 'us-central1');
      const acceptCall = httpsCallable<{ callId: string }, AcceptCallResult>(functions, 'acceptCall');
      const res = await acceptCall({ callId });
      
      if (res.data?.token && res.data?.roomUrl) {
        sessionStorage.setItem(`dailyToken:${callId}`, res.data.token);
        sessionStorage.setItem(`dailyRoomUrl:${callId}`, res.data.roomUrl);
        router.push(`/call/${callId}`);
      }
    } catch (e: any) {
      pushToast({
        variant: 'destructive',
        title: 'Accept failed',
        description: e.message || 'Could not accept the call.',
      });
    } finally {
      setBusyCallId(null);
    }
  };

  const handleDecline = async () => {
    if (!incomingCall || busyCallIdRef.current) return;
    const callId = incomingCall.id;

    setBusyCallId(callId);
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
      setBusyCallId(null);
    }
  };

  return (
    <>
      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200">
          <Card className="w-full max-w-[320px] shadow-2xl border-primary/20">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4 animate-bounce">
                <div className="relative">
                   <div className="absolute -inset-4 rounded-full bg-primary/20 animate-ping" />
                   <Phone className="h-12 w-12 text-primary relative" />
                </div>
              </div>
              <CardTitle className="text-xl">Вхідний виклик</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Телефонує {incomingCall.callerName || 'Користувач'}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 py-4">
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-muted p-2 rounded">
                Offer ID: {incomingCall.offerId?.slice(0, 8)}...
              </div>
            </CardContent>
            <CardFooter className="flex gap-3 pt-2">
              <Button 
                variant="destructive" 
                className="flex-1 h-12 rounded-xl"
                onClick={handleDecline}
                disabled={!!busyCallId}
              >
                {busyCallId ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="mr-2 h-4 w-4" />}
                Відхилити
              </Button>
              <Button 
                className="flex-1 h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white"
                onClick={handleAccept}
                disabled={!!busyCallId}
              >
                {busyCallId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
                Прийняти
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Active Call Bar */}
      {activeCallWithCaller && !incomingCall ? (
        <ActiveCallBar call={activeCallWithCaller} />
      ) : null}
    </>
  );
}
