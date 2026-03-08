
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createRecognizer } from '@/lib/speech/recognizer';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

interface UseSpeechRecognizerParams {
  enabled: boolean;
  sourceLocale: string;
  onRecognized: (text: string) => void;
  onRecognizing?: (text: string) => void;
}

/**
 * Hook to manage the lifecycle of Azure Speech Recognition during a call.
 * Implements a hybrid buffering strategy:
 * 1. Low-latency local preview (recognizing)
 * 2. Smart buffering for final segments (recognized) to improve translation and save writes.
 */
export function useSpeechRecognizer({
  enabled,
  sourceLocale,
  onRecognized,
  onRecognizing
}: UseSpeechRecognizerParams) {
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);
  const bufferRef = useRef("");
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Watchdog state
  const lastEventAtRef = useRef<number>(Date.now());
  const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRestartingRef = useRef(false);

  const flushBuffer = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const text = bufferRef.current.trim();
    if (!text || text.length < 2) {
      bufferRef.current = "";
      return;
    }

    console.debug('[SpeechRecognizer] Flushing buffer:', { textLength: text.length });
    bufferRef.current = "";
    onRecognized(text);
    
    if (onRecognizing) {
      onRecognizing("");
    }
  }, [onRecognized, onRecognizing]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushBuffer();
    }, 1800); // 1.8 seconds silence trigger
  }, [flushBuffer]);

  const stopRecognizer = useCallback(async () => {
    if (recognizerRef.current) {
      console.info('[SpeechRecognizer] Stopping recognizer...');
      try {
        await new Promise<void>((resolve) => {
          recognizerRef.current?.stopContinuousRecognitionAsync(() => resolve(), () => resolve());
        });
      } catch (e) {
        console.warn('[SpeechRecognizer] Error during stop:', e);
      }
      recognizerRef.current = null;
    }
  }, []);

  const restartRecognizer = useCallback(async () => {
    if (isRestartingRef.current) return;
    isRestartingRef.current = true;
    
    console.info('[SpeechRecognizer] Triggering restart sequence...');
    await stopRecognizer();
    await startRecognizer();
    
    isRestartingRef.current = false;
  }, [stopRecognizer]);

  const startRecognizer = useCallback(async () => {
    if (!enabled || !sourceLocale) return;
    
    console.info('[SpeechRecognizer] Starting recognizer...', { locale: sourceLocale });
    lastEventAtRef.current = Date.now();

    try {
      const activeRecognizer = await createRecognizer(sourceLocale);
      recognizerRef.current = activeRecognizer;

      activeRecognizer.recognizing = (_: any, event: any) => {
        lastEventAtRef.current = Date.now();
        const text = event.result.text;
        if (text && onRecognizing) {
          onRecognizing(text);
        }
      };

      activeRecognizer.recognized = (_: any, event: any) => {
        lastEventAtRef.current = Date.now();
        if (event.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const text = event.result.text;
          if (!text || text.trim().length < 2) return;

          console.debug('[SpeechRecognizer] Chunk recognized:', { text });
          bufferRef.current += (bufferRef.current ? " " : "") + text.trim();

          // Flush immediately if sentence ends with . ? !
          if (/[.?!]$/.test(text.trim())) {
            flushBuffer();
          } else {
            scheduleFlush();
          }
        }
      };

      activeRecognizer.canceled = (s: any, e: any) => {
        console.warn('[SpeechRecognizer] Canceled:', { reason: e.reason, details: e.errorDetails });
        if (e.reason === SpeechSDK.CancellationReason.Error) {
          restartRecognizer();
        }
      };

      activeRecognizer.sessionStarted = () => console.info('[SpeechRecognizer] Azure session started');
      activeRecognizer.sessionStopped = () => console.info('[SpeechRecognizer] Azure session stopped');

      activeRecognizer.startContinuousRecognitionAsync(
        () => console.info('[SpeechRecognizer] Continuous recognition service online'),
        (err) => console.error('[SpeechRecognizer] Failed to start service', err)
      );
    } catch (err) {
      console.error('[SpeechRecognizer] Initialization error:', err);
    }
  }, [enabled, sourceLocale, onRecognizing, flushBuffer, scheduleFlush, restartRecognizer]);

  // Watchdog effect: Azure streams can sometimes hang silently
  useEffect(() => {
    if (!enabled) {
      if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
      return;
    }

    watchdogTimerRef.current = setInterval(() => {
      const idleTime = Date.now() - lastEventAtRef.current;
      // If idle for 45s while enabled, something might be wrong with the stream
      if (idleTime > 45000 && !isRestartingRef.current) {
        console.warn('[SpeechRecognizer] Watchdog: No speech events for 45s, restarting stream...');
        restartRecognizer();
      }
    }, 15000);

    return () => {
      if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
    };
  }, [enabled, restartRecognizer]);

  // Network online listener: Restart when connection is restored
  useEffect(() => {
    const handleOnline = () => {
      console.info('[SpeechRecognizer] Network connection restored, reconnecting...');
      restartRecognizer();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [restartRecognizer]);

  // Main lifecycle effect
  useEffect(() => {
    if (enabled) {
      startRecognizer();
    } else {
      stopRecognizer().then(() => flushBuffer());
    }

    return () => {
      stopRecognizer();
      if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [enabled, sourceLocale, startRecognizer, stopRecognizer, flushBuffer]);

  return {
    restart: restartRecognizer
  };
}
