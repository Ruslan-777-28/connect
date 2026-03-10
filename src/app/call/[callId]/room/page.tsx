'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DailyIframe, { type DailyCall } from '@daily-co/daily-js';
import { doc, onSnapshot } from 'firebase/firestore';
import { useFirebaseApp, useFirestore, useUser } from '@/firebase';
import { endCallClient } from '@/lib/calls';
import type { Call } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { PhoneOff, Loader2, MessageSquareQuote } from 'lucide-react';
import { useCallTranslation } from '@/hooks/useCallTranslation';
import { TranslationStatusBadge } from '@/components/call/TranslationStatusBadge';
import { TranslatedCaptionsPanel } from '@/components/call/TranslatedCaptionsPanel';
import { useSpeechRecognizer } from '@/hooks/useSpeechRecognizer';
import { cn } from '@/lib/utils';

function buildDailyUrl(roomUrl: string, token: string) {
  const url = new URL(roomUrl);
  url.searchParams.set('t', token);
  return url.toString();
}

export default function CallRoomPage() {
  const router = useRouter();
  const { callId } = useParams<{ callId: string }>();

  const app = useFirebaseApp();
  const firestore = useFirestore();
  const { user } = useUser();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const callRef = useRef<DailyCall | null>(null);
  const endingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [callData, setCallData] = useState<Call | null>(null);
  const [status, setStatus] = useState<Call['status'] | 'unknown'>('unknown');
  const [showCaptions, setShowCaptions] = useState(true);
  const [localPreviewText, setLocalPreviewText] = useState("");

  const { translation, segments, status: translationStatus } = useCallTranslation(callId);

  const token = useMemo(() => sessionStorage.getItem(`dailyToken:${callId}`), [callId]);
  const roomUrl = useMemo(() => sessionStorage.getItem(`dailyRoomUrl:${callId}`), [callId]);

  const urlWithToken = useMemo(() => {
    if (!token || !roomUrl) return null;
    return buildDailyUrl(roomUrl, token);
  }, [roomUrl, token]);

  const hardExitToHome = useCallback(() => {
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
    await endCallClient(app, callId, 'ended');
  }, [app, callId]);

  // Setup Speech Recognition
  const myProfileId = user?.uid;
  const myConfig = translation?.participants?.[myProfileId || ''];
  
  const handleRecognized = useCallback(async (text: string) => {
    if (!myProfileId || !text?.trim()) return;
    
    // Exact log format requested for debugging
    console.log('[CallRoom] Sending segment payload', {
      callId,
      speakerId: myProfileId,
      text,
    });
    
    // Send to translation pipeline - using strictly formatted fetch
    try {
      const res = await fetch('/api/translation/segment', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          callId,
          speakerId: myProfileId,
          text,
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('[CallRoom] API Error:', res.status, errorData);
      }
    } catch (err) {
      console.error('Failed to send translation segment:', err);
    }
  }, [callId, myProfileId]);

  useSpeechRecognizer({
    enabled: !!(callData?.translationEnabled && status === 'accepted' && myConfig),
    sourceLocale: myConfig?.sourceLocale || 'uk-UA',
    onRecognized: handleRecognized,
    onRecognizing: setLocalPreviewText,
  });

  useEffect(() => {
    const unsub = onSnapshot(
      doc(firestore, 'calls', callId),
      async (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          await leaveAndDestroy();
          hardExitToHome();
          return;
        }
        const data = snap.data() as Call;
        setCallData(data);
        setStatus(data.status ?? 'unknown');
        
        if (data.status === 'ended') {
          await leaveAndDestroy();
          hardExitToHome();
        }

        if (data.status === 'accepted' && data.translationEnabled && translationStatus === 'idle') {
          fetch(`/api/calls/${callId}/translation/start`, { method: 'POST' }).catch(console.error);
        }
      },
      async () => {
        setLoading(false);
        await leaveAndDestroy();
        hardExitToHome();
      }
    );
    return () => unsub();
  }, [callId, firestore, hardExitToHome, leaveAndDestroy, translationStatus]);

  useEffect(() => {
    if (!urlWithToken) return;
    const container = containerRef.current;
    if (!container) return;
  
    let cancelled = false;
  
    (async () => {
      try {
        const existing = (DailyIframe as any).getCallInstance?.();
        if (existing) {
          callRef.current = existing;
          const iframe = existing.iframe?.();
          if (iframe && iframe.parentElement !== container) {
            container.innerHTML = '';
            container.appendChild(iframe);
          }
          try { existing.join?.({ url: urlWithToken }); } catch {}
          return;
        }
      } catch {}
  
      container.innerHTML = '';
      await new Promise((r) => setTimeout(r, 0));
      if (cancelled) return;
  
      const call = DailyIframe.createFrame(container, {
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: '0',
          borderRadius: '16px',
        },
        showLeaveButton: false,
        showFullscreenButton: true,
      });
  
      callRef.current = call;
      call.join({ url: urlWithToken });
      call.on('left-meeting', () => {
        try { call.destroy(); } catch {}
        callRef.current = null;
        hardExitToHome();
      });
    })();
  
    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [hardExitToHome, urlWithToken]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between gap-3 p-3 border-b bg-background/95 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            <span className="uppercase tracking-widest">{status}</span>
          </div>
          
          <TranslationStatusBadge status={translationStatus} />
        </div>

        <div className="flex items-center gap-2">
          {translation?.enabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCaptions(!showCaptions)}
              className={cn("h-9 rounded-full px-4 border-primary/20", showCaptions && "bg-primary/10 text-primary")}
            >
              <MessageSquareQuote className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">{showCaptions ? 'Приховати субтитри' : 'Показати субтитри'}</span>
            </Button>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={handleEnd}
            disabled={loading || status === 'ended'}
            className="h-9 rounded-full px-4 shadow-lg shadow-destructive/20"
          >
            <PhoneOff className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Завершити</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 relative overflow-hidden bg-muted/20 p-2 sm:p-4">
        <div className="flex-1 h-full w-full">
          <div ref={containerRef} className="h-full w-full" />
        </div>

        {translation?.enabled && showCaptions && (
          <div className={cn(
            "absolute z-30 transition-all duration-500 ease-in-out",
            "top-2 left-2 right-2 h-32 md:h-auto md:top-20 md:bottom-24 md:right-4 md:left-auto md:w-full md:max-w-[320px]",
            showCaptions 
              ? "translate-y-0 opacity-100" 
              : "-translate-y-4 opacity-0 pointer-events-none md:translate-x-full md:translate-y-0"
          )}>
            <TranslatedCaptionsPanel 
              segments={segments} 
              localPreview={localPreviewText}
              className="h-full w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}
