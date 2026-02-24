'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DailyIframe, { type DailyCall } from '@daily-co/daily-js';
import { doc, onSnapshot } from 'firebase/firestore';
import { useFirebaseApp, useFirestore } from '@/firebase';
import { endCallClient } from '@/lib/calls';
import type { Call } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { PhoneOff, Loader2 } from 'lucide-react';

function buildDailyUrl(roomUrl: string, token: string) {
  const url = new URL(roomUrl);
  url.searchParams.set('t', token); // ok for MVP
  return url.toString();
}

export default function CallRoomPage() {
  const router = useRouter();
  const { callId } = useParams<{ callId: string }>();

  const app = useFirebaseApp();
  const firestore = useFirestore();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const callRef = useRef<DailyCall | null>(null);
  const endingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Call['status'] | 'unknown'>('unknown');

  // читаємо з sessionStorage (MVP)
  const token = useMemo(() => sessionStorage.getItem(`dailyToken:${callId}`), [callId]);
  const roomUrl = useMemo(() => sessionStorage.getItem(`dailyRoomUrl:${callId}`), [callId]);

  const urlWithToken = useMemo(() => {
    if (!token || !roomUrl) return null;
    return buildDailyUrl(roomUrl, token);
  }, [roomUrl, token]);

  const hardExitToHome = useCallback(() => {
    // чистимо локальні ключі (щоб не “залипало”)
    sessionStorage.removeItem(`dailyToken:${callId}`);
    sessionStorage.removeItem(`dailyRoomUrl:${callId}`);
    router.replace('/');
  }, [callId, router]);

  const destroyDaily = useCallback(() => {
    try {
      callRef.current?.destroy();
    } catch {}
    callRef.current = null;
  }, []);

  const leaveAndDestroy = useCallback(async () => {
    try {
      await callRef.current?.leave();
    } catch {}
    destroyDaily();
  }, [destroyDaily]);

  const handleEnd = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;

    // server-first
    await endCallClient(app, callId, 'ended');
    // НЕ робимо router тут — дочекаємось Firestore status === ended
  }, [app, callId]);

  // 1) Firestore listener — істина стану
  useEffect(() => {
    const unsub = onSnapshot(
      doc(firestore, 'calls', callId),
      async (snap) => {
        setLoading(false);

        if (!snap.exists()) {
          // документ пропав — виходимо
          await leaveAndDestroy();
          hardExitToHome();
          return;
        }

        const data = snap.data() as Call;
        setStatus(data.status ?? 'unknown');

        if (data.status === 'ended') {
          // server-driven завершення
          await leaveAndDestroy();
          hardExitToHome();
        }
      },
      async () => {
        // при помилці лістенера — безпечний вихід
        setLoading(false);
        await leaveAndDestroy();
        hardExitToHome();
      }
    );

    return () => unsub();
  }, [callId, firestore, hardExitToHome, leaveAndDestroy]);

  // 2) Монтуємо Daily embedded
  useEffect(() => {
    if (!urlWithToken) {
      // немає токена — зайшли напряму або токен вже очищено
      hardExitToHome();
      return;
    }
    if (!containerRef.current) return;
    if (callRef.current) return;

    // створюємо call frame
    const call = DailyIframe.createFrame(containerRef.current, {
      iframeStyle: {
        width: '100%',
        height: '100%',
        border: '0',
        borderRadius: '16px',
      },
      // прибираємо стандартні кнопки, щоб керування було твоє
      showLeaveButton: false,
      showFullscreenButton: true,
    });

    callRef.current = call;

    // join
    call.join({ url: urlWithToken });

    // якщо юзер якось вийшов (напр. закрив вкладку/бек) — просто виходимо в app
    call.on('left-meeting', () => {
      // не авто-end (поки без webhooks), просто повертаємось
      destroyDaily();
      hardExitToHome();
    });

    return () => {
      // cleanup при розмонтуванні
      try {
        call.destroy();
      } catch {}
      callRef.current = null;
    };
  }, [destroyDaily, hardExitToHome, urlWithToken]);

  return (
    <div className="flex min-h-screen w-full flex-col">
      <div className="flex items-center justify-between gap-3 p-4 border-b bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span className="capitalize">status: {status}</span>
        </div>

        <Button
          variant="destructive"
          onClick={handleEnd}
          disabled={loading || status === 'ended'}
        >
          <PhoneOff className="mr-2 h-4 w-4" />
          End Call
        </Button>
      </div>

      <div className="flex-1 p-4 bg-muted/40">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
