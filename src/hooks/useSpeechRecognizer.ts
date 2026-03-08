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
 * 2. Smart buffering for final segments (recognized) to improve translation quality and reduce writes.
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
  
  // Watchdog state to recover from silent hangs
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

    console.info('[SpeechRecognizer] Flushing phrase buffer:', { length: text.length });
    onRecognized(text);
    bufferRef.current = "";
    
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
        console.warn('[SpeechRecognizer] Stop error:', e);
      }
      recognizerRef.current = null;
    }
  }, []);

  const restartRecognizer = useCallback(async () => {
    if (isRestartingRef.current) return;
    isRestartingRef.current = true;
    
    console.info('[SpeechRecognizer] Reconnecting...');
    await stopRecognizer();
    await startRecognizer();
    
    isRestartingRef.current = false;
  }, [stopRecognizer]);

  const startRecognizer = useCallback(async () => {
    if (!enabled || !sourceLocale) return;
    
    console.info('[SpeechRecognizer] Starting session...', { locale: sourceLocale });
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

          console.debug('[SpeechRecognizer] Chunk recognized:', text);
          bufferRef.current += (bufferRef.current ? " " : "") + text.trim();

          // Flush immediately if punctuation detected
          if (/[.?!]$/.test(text.trim())) {
            flushBuffer();
          } else {
            scheduleFlush();
          }
        }
      };

      activeRecognizer.canceled = (s: any, e: any) => {
        console.warn('[SpeechRecognizer] Canceled:', e.reason);
        if (e.reason === SpeechSDK.CancellationReason.Error) {
          restartRecognizer();
        }
      };

      activeRecognizer.startContinuousRecognitionAsync(
        () => console.info('[SpeechRecognizer] Recognition active'),
        (err) => console.error('[SpeechRecognizer] Start failed', err)
      );
    } catch (err) {
      console.error('[SpeechRecognizer] Init error:', err);
    }
  }, [enabled, sourceLocale, onRecognizing, flushBuffer, scheduleFlush, restartRecognizer]);

  // Watchdog & Reconnection
  useEffect(() => {
    if (!enabled) return;

    watchdogTimerRef.current = setInterval(() => {
      if (Date.now() - lastEventAtRef.current > 45000 && !isRestartingRef.current) {
        restartRecognizer();
      }
    }, 15000);

    const handleOnline = () => restartRecognizer();
    window.addEventListener('online', handleOnline);

    return () => {
      if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled, restartRecognizer]);

  useEffect(() => {
    if (enabled) {
      startRecognizer();
    } else {
      stopRecognizer().then(() => flushBuffer());
    }

    return () => {
      stopRecognizer();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [enabled, sourceLocale, startRecognizer, stopRecognizer, flushBuffer]);

  return { restart: restartRecognizer };
}
