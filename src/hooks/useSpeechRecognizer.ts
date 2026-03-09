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
 * Manages the lifecycle of Azure Speech Recognition during a call.
 * 
 * Includes "Reconnect Hardening":
 * 1. Automatic recovery on browser 'online' event.
 * 2. Watchdog timer for silent sessions.
 * 3. Intelligent restarts on canceled events.
 */
export function useSpeechRecognizer({
  enabled,
  sourceLocale,
  onRecognized,
  onRecognizing
}: UseSpeechRecognizerParams) {
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);
  const isStartingRef = useRef(false);
  
  // Buffering and Watchdog refs
  const bufferRef = useRef("");
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const watchdogIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityAtRef = useRef<number>(Date.now());

  const clearTimers = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (watchdogIntervalRef.current) {
      clearInterval(watchdogIntervalRef.current);
      watchdogIntervalRef.current = null;
    }
  }, []);

  const flushBuffer = useCallback(() => {
    const text = bufferRef.current.trim();
    if (text.length > 1) {
      console.log('[SpeechRecognizer] Flushing phrase buffer:', text);
      onRecognized(text);
      lastActivityAtRef.current = Date.now();
    }
    bufferRef.current = "";
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, [onRecognized]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushBuffer();
    }, 1800);
  }, [flushBuffer]);

  const stopRecognizer = useCallback(async () => {
    clearTimers();
    if (recognizerRef.current) {
      console.info('[SpeechRecognizer] Stopping recognizer session...');
      try {
        if (bufferRef.current.trim()) flushBuffer();
        
        const r = recognizerRef.current;
        recognizerRef.current = null;
        
        await new Promise<void>((resolve) => {
          r.stopContinuousRecognitionAsync(
            () => {
              r.close();
              resolve();
            },
            (err) => {
              console.warn('[SpeechRecognizer] Force close failed:', err);
              resolve();
            }
          );
        });
      } catch (e) {
        console.warn('[SpeechRecognizer] Error during cleanup:', e);
      }
    }
  }, [flushBuffer, clearTimers]);

  const startRecognizer = useCallback(async () => {
    if (!enabled || !sourceLocale || isStartingRef.current) return;
    
    isStartingRef.current = true;
    console.info('[SpeechRecognizer] Initializing Azure session...', { locale: sourceLocale });

    try {
      const activeRecognizer = await createRecognizer(sourceLocale);
      recognizerRef.current = activeRecognizer;

      activeRecognizer.recognizing = (_: any, event: any) => {
        const text = event.result.text;
        lastActivityAtRef.current = Date.now();
        if (text && text.length >= 2 && onRecognizing) {
          onRecognizing(text);
        }
      };

      activeRecognizer.recognized = (_: any, event: any) => {
        lastActivityAtRef.current = Date.now();
        if (event.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const text = event.result.text?.trim();
          if (text && text.length > 1) {
            const currentBuffer = bufferRef.current.trim();
            if (!currentBuffer.endsWith(text)) {
              bufferRef.current += (bufferRef.current ? " " : "") + text;
            }
            
            if (/[.?!]$/.test(text)) {
              flushBuffer();
            } else {
              scheduleFlush();
            }
          }
        }
      };

      activeRecognizer.canceled = async (_: any, e: any) => {
        console.warn('[SpeechRecognizer] Session canceled:', e.reason, e.errorDetails || '');
        isStartingRef.current = false;
        if (!enabled) return;
        
        // Trigger recovery
        setTimeout(() => {
          if (enabled) startRecognizer();
        }, 1000);
      };

      activeRecognizer.startContinuousRecognitionAsync(
        () => {
          console.info('[SpeechRecognizer] ACTIVE');
          isStartingRef.current = false;
          lastActivityAtRef.current = Date.now();

          if (watchdogIntervalRef.current) {
            clearInterval(watchdogIntervalRef.current);
          }

          watchdogIntervalRef.current = setInterval(() => {
            const idleMs = Date.now() - lastActivityAtRef.current;
            if (enabled && idleMs > 35000) {
              console.warn('[SpeechRecognizer] Watchdog triggered (idle for 35s)');
              stopRecognizer().then(() => startRecognizer());
            }
          }, 10000);
        },
        (err) => {
          console.error('[SpeechRecognizer] Start failed:', err);
          isStartingRef.current = false;
        }
      );
    } catch (err) {
      console.error('[SpeechRecognizer] Initialization failed:', err);
      isStartingRef.current = false;
    }
  }, [enabled, sourceLocale, onRecognizing, flushBuffer, scheduleFlush, stopRecognizer]);

  // Handle browser online event
  useEffect(() => {
    if (!enabled) return;
    const handleOnline = () => {
      console.info('[SpeechRecognizer] Browser online, recovery triggered');
      stopRecognizer().then(() => startRecognizer());
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [enabled, startRecognizer, stopRecognizer]);

  // Primary lifecycle
  useEffect(() => {
    const boot = async () => {
      await stopRecognizer();
      if (enabled) {
        startRecognizer();
      }
    };
    boot();

    return () => {
      stopRecognizer();
    };
  }, [enabled, sourceLocale, startRecognizer, stopRecognizer]); 

  return { 
    recognizer: recognizerRef.current 
  };
}
