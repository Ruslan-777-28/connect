
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
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // If no credentials in session storage, kick user out after a short delay
    // unless they are a participant and we can recover state (advanced MVP)
    if (!tokenExists) {
      if (!redirectTimerRef.current) {
        redirectTimerRef.current = setTimeout(() => router.replace('/'), 2000);
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
            redirectTimerRef.current = setTimeout(() => router.replace('/'), 1200);
          }
        }
      },
      (err) => {
        console.error('Call doc listener error:', err);
        setLoading(false);
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
    <div className="flex min-h-[calc(100vh-4rem)] w-full items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center">
          <CardTitle>Лобі виклику</CardTitle>
          <CardDescription>
            Зачекайте підтвердження або приєднайтеся до кімнати.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-6 py-6">
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Статус виклику</span>
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <Badge variant={getStatusBadgeVariant(status)} className="px-4 py-1 text-sm capitalize">
                {status}
              </Badge>
            )}
          </div>

          <div className="flex w-full flex-col gap-3">
            <Button
              size="lg"
              onClick={handleJoinRoom}
              disabled={!tokenExists || status === 'ended' || status === 'ringing' || loading}
              className="w-full h-12 text-base font-bold shadow-lg"
            >
              <LogIn className="mr-2 h-5 w-5" />
              Увійти в кімнату
            </Button>
            
            <Button
              variant="outline"
              size="lg"
              onClick={handleEnd}
              disabled={status === 'ended' || loading}
              className="w-full h-12 border-destructive/20 text-destructive hover:bg-destructive/10"
            >
              <PhoneOff className="mr-2 h-5 w-5" />
              Завершити виклик
            </Button>
          </div>

          {status === 'ringing' && (
            <div className="flex flex-col items-center gap-2 text-center animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Очікуємо прийняття іншим учасником...</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="bg-muted/30 border-t pt-4">
          <p className="w-full text-center text-[10px] text-muted-foreground leading-relaxed">
            Приєднання до кімнати активує вашу камеру та мікрофон. <br/>Будь ласка, надайте дозвіл у браузері.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
