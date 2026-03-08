
'use client';

import { useEffect, useRef } from 'react';
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
 */
export function useSpeechRecognizer({
  enabled,
  sourceLocale,
  onRecognized,
  onRecognizing
}: UseSpeechRecognizerParams) {
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);

  useEffect(() => {
    if (!enabled || !sourceLocale) {
      if (recognizerRef.current) {
        recognizerRef.current.stopContinuousRecognitionAsync();
        recognizerRef.current = null;
      }
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
            // Filter out very short phrases (noise, filler sounds) to avoid unnecessary translations
            if (text && text.trim().length >= 3) {
              onRecognized(text);
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
    };
  }, [enabled, sourceLocale, onRecognized, onRecognizing]);
}
