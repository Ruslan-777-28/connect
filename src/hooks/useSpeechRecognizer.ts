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
 * Logic:
 * 1. recognizing -> Local UI preview only (throttled).
 * 2. recognized -> Accumulates into buffer with deduplication.
 * 3. flush -> Triggers on punctuation (.?!) or 1.8s silence.
 */
export function useSpeechRecognizer({
  enabled,
  sourceLocale,
  onRecognized,
  onRecognizing
}: UseSpeechRecognizerParams) {
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);
  const isStartingRef = useRef(false);
  
  // Buffering logic for high-quality translation context
  const bufferRef = useRef("");
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);

  const flushBuffer = useCallback(() => {
    const text = bufferRef.current.trim();
    if (text.length > 1) {
      console.log('[SpeechRecognizer] Flushing phrase buffer:', text);
      onRecognized(text);
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
    if (recognizerRef.current) {
      console.info('[SpeechRecognizer] Stopping recognizer session...');
      try {
        // Flush any remaining buffer before closing
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
  }, [flushBuffer]);

  const startRecognizer = useCallback(async () => {
    if (!enabled || !sourceLocale || isStartingRef.current) return;
    
    isStartingRef.current = true;
    console.info('[SpeechRecognizer] Initializing Azure session...', { locale: sourceLocale });

    try {
      const activeRecognizer = await createRecognizer(sourceLocale);
      recognizerRef.current = activeRecognizer;

      // 1. recognizing -> Local UI preview
      activeRecognizer.recognizing = (_: any, event: any) => {
        const text = event.result.text;
        if (text && text.length >= 2 && onRecognizing) {
          onRecognizing(text);
        }
      };

      // 2. recognized -> Phrase accumulation
      activeRecognizer.recognized = (_: any, event: any) => {
        if (event.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const text = event.result.text?.trim();
          if (text && text.length > 1) {
            // Deduplication guard: don't add if already in buffer
            const currentBuffer = bufferRef.current.trim();
            if (!currentBuffer.endsWith(text)) {
              bufferRef.current += (bufferRef.current ? " " : "") + text;
            }
            
            // If phrase ends with punctuation, flush immediately
            if (/[.?!]$/.test(text)) {
              flushBuffer();
            } else {
              // Otherwise, wait for silence to gather full context
              scheduleFlush();
            }
          }
        }
      };

      activeRecognizer.canceled = (s: any, e: any) => {
        console.warn('[SpeechRecognizer] Session canceled:', e.reason);
        isStartingRef.current = false;
      };

      activeRecognizer.startContinuousRecognitionAsync(
        () => {
          console.info('[SpeechRecognizer] ACTIVE');
          isStartingRef.current = false;
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
  }, [enabled, sourceLocale, onRecognizing, flushBuffer, scheduleFlush]);

  useEffect(() => {
    const restart = async () => {
      await stopRecognizer();
      if (enabled) {
        startRecognizer();
      }
    };
    restart();

    return () => {
      stopRecognizer();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [enabled, sourceLocale, startRecognizer, stopRecognizer]); 

  return { 
    recognizer: recognizerRef.current 
  };
}
