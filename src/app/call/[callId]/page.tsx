'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { onSnapshot, doc } from 'firebase/firestore';
import type { Call } from '@/lib/types';
import { endCallClient } from '@/lib/calls';
import { useFirebaseApp, useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, PhoneOff, LogIn } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function CallPage() {
  const params = useParams<{ callId: string }>();
  const callId = params.callId;
  const router = useRouter();
  const app = useFirebaseApp();
  const firestore = useFirestore();

  const [callData, setCallData] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tokenExists = useMemo(
    () => !!sessionStorage.getItem(`dailyToken:${callId}`),
    [callId]
  );

  const handleJoinRoom = useCallback(() => {
    router.push(`/call/${callId}/room`);
  }, [router, callId]);

  const handleEnd = useCallback(async () => {
    await endCallClient(app, callId, 'ended');
  }, [app, callId]);

  useEffect(() => {
    // General cleanup for the redirect timer on component unmount
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!tokenExists) {
      if (!redirectTimerRef.current) {
        redirectTimerRef.current = setTimeout(() => router.replace('/'), 1500);
      }
      return;
    }

    const unsub = onSnapshot(
      doc(firestore, 'calls', callId),
      (snap) => {
        setLoading(false);

        if (!snap.exists()) {
          if (!redirectTimerRef.current) {
            redirectTimerRef.current = setTimeout(() => router.replace('/'), 800);
          }
          return;
        }

        const data = snap.data() as Call;
        setCallData(data);

        if (data.status === 'ended') {
          sessionStorage.removeItem(`dailyToken:${callId}`);
          sessionStorage.removeItem(`dailyRoomUrl:${callId}`);
          
          if (!redirectTimerRef.current) {
            redirectTimerRef.current = setTimeout(() => router.replace('/'), 800);
          }
        }
      },
      (err) => {
        console.error('Call doc listener error:', err);
        setLoading(false);
        // This is an error case, a quick redirect is fine.
        router.replace('/');
      }
    );

    return () => unsub();
  }, [callId, firestore, router, tokenExists]);

  const status = callData?.status || 'loading';

  const getStatusBadgeVariant = (status: Call['status'] | 'loading') => {
    switch (status) {
      case 'ringing':
        return 'default';
      case 'accepted':
        return 'secondary';
      case 'ended':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Call Lobby</CardTitle>
          <CardDescription>
            You are about to join a video call.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            Status:
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Badge variant={getStatusBadgeVariant(status)} className="capitalize">
                {status}
              </Badge>
            )}
          </div>
          <div className="flex w-full gap-3">
            <Button
              onClick={handleJoinRoom}
              disabled={!tokenExists || status === 'ended' || status === 'ringing'}
              className="flex-1"
            >
              <LogIn className="mr-2" />
              Join Room
            </Button>
            <Button
              variant="destructive"
              onClick={handleEnd}
              disabled={status === 'ended' || loading}
              className="flex-1"
            >
              <PhoneOff className="mr-2" />
              End Call
            </Button>
          </div>
          {status === 'ringing' && (
            <p className="text-sm text-muted-foreground">Waiting for the other user to accept...</p>
          )}
        </CardContent>
        <CardFooter>
          <p className="w-full text-center text-xs text-muted-foreground">
            Once you join, the video will be embedded on the next page.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
