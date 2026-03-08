
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
 * Implements a hybrid phrase buffering strategy:
 * 1. Intermediate results (recognizing) are sent to onRecognizing for local preview.
 * 2. Final results (recognized) are buffered for ~1.8s or until punctuation is found
 *    to create meaningful sentences for better translation and fewer Firestore writes.
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

  // Memoized function to flush the buffer and send the complete phrase
  const flushBuffer = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const text = bufferRef.current.trim();
    if (!text) return;

    bufferRef.current = "";
    onRecognized(text);
    
    // Clear preview when a final segment is confirmed and buffered
    if (onRecognizing) {
      onRecognizing("");
    }
  }, [onRecognized, onRecognizing]);

  // Helper to schedule a buffer flush after a period of silence
  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushBuffer();
    }, 1800); // 1.8 seconds of silence before flushing
  }, [flushBuffer]);

  useEffect(() => {
    if (!enabled || !sourceLocale) {
      if (recognizerRef.current) {
        recognizerRef.current.stopContinuousRecognitionAsync();
        recognizerRef.current = null;
      }
      // Ensure we flush any remaining text when stopping
      flushBuffer();
      return;
    }

    let activeRecognizer: SpeechSDK.SpeechRecognizer | null = null;

    async function start() {
      try {
        activeRecognizer = await createRecognizer(sourceLocale);
        recognizerRef.current = activeRecognizer;

        activeRecognizer.recognizing = (_: any, event: any) => {
          const text = event.result.text;
          if (text && onRecognizing) {
            onRecognizing(text);
          }
        };

        activeRecognizer.recognized = (_: any, event: any) => {
          if (event.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
            const text = event.result.text;
            if (!text || text.trim().length < 2) return;

            // Accumulate chunks in the buffer
            bufferRef.current += (bufferRef.current ? " " : "") + text.trim();

            // Optimization: If the phrase ends with terminal punctuation, flush immediately.
            // This makes the UI feel more responsive for natural sentence endings.
            if (/[.?!]$/.test(text.trim())) {
              flushBuffer();
            } else {
              // Otherwise, wait for a pause to see if the speaker continues the thought
              scheduleFlush();
            }
          }
        };

        activeRecognizer.canceled = (s: any, e: any) => {
          console.warn(`Speech recognition canceled: ${e.errorDetails}`);
          if (e.reason === SpeechSDK.CancellationReason.Error) {
            activeRecognizer?.stopContinuousRecognitionAsync();
          }
        };

        activeRecognizer.startContinuousRecognitionAsync(
          () => console.log('Speech recognition started'),
          (err) => console.error('Failed to start speech recognition', err)
        );
      } catch (err) {
        console.error('Recognizer initialization error:', err);
      }
    }

    start();

    return () => {
      if (activeRecognizer) {
        activeRecognizer.stopContinuousRecognitionAsync();
        recognizerRef.current = null;
      }
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [enabled, sourceLocale, onRecognized, onRecognizing, flushBuffer, scheduleFlush]);
}
