'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Loader2, PhoneOff, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function buildDailyUrl(roomUrl: string, token: string) {
  const url = new URL(roomUrl);
  url.searchParams.set('t', token);
  return url.toString();
}

export default function CallPage({ params }: { params: { callId: string } }) {
  const router = useRouter();
  const app = useFirebaseApp();
  const firestore = useFirestore();
  const callId = params.callId;

  const [callData, setCallData] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);

  const dailyWinRef = useRef<Window | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const token = useMemo(
    () => sessionStorage.getItem(`dailyToken:${callId}`),
    [callId]
  );
  const roomUrl = useMemo(
    () => sessionStorage.getItem(`dailyRoomUrl:${callId}`),
    [callId]
  );

  const urlWithToken = useMemo(() => {
    if (!token || !roomUrl) return null;
    return buildDailyUrl(roomUrl, token);
  }, [token, roomUrl]);

  const closeDailyTab = useCallback(() => {
    try {
      if (dailyWinRef.current && !dailyWinRef.current.closed) {
        dailyWinRef.current.close();
      }
    } catch {}
    dailyWinRef.current = null;
  }, []);

  const openDaily = useCallback(() => {
    if (!urlWithToken) return;

    if (isMobileBrowser()) {
      window.location.replace(urlWithToken);
      return;
    }

    const w = window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (!w) {
      alert('Please allow pop-ups to open the video call.');
      return;
    }

    try {
      w.opener = null;
    } catch {}
    w.location.replace(urlWithToken);
    dailyWinRef.current = w;
  }, [urlWithToken]);

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
    if (!urlWithToken) {
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
          closeDailyTab();
          if (!redirectTimerRef.current) {
            redirectTimerRef.current = setTimeout(() => router.replace('/'), 800);
          }
          return;
        }

        const data = snap.data() as Call;
        setCallData(data);

        if (data.status === 'ended') {
          closeDailyTab();
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
  }, [callId, closeDailyTab, firestore, router, urlWithToken]);

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
          <CardTitle>Call Controller</CardTitle>
          <CardDescription>
            Manage your video call session from here.
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
              onClick={openDaily}
              disabled={!urlWithToken || status === 'ended'}
              className="flex-1"
            >
              <Video className="mr-2" />
              Open Video
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
        </CardContent>
        <CardFooter>
          <p className="w-full text-center text-xs text-muted-foreground">
            Use this page to open and end your video call.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
