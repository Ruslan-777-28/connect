
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
 * Хук для керування життєвим циклом розпізнавання мовлення під час дзвінка.
 */
export function useSpeechRecognizer({
  enabled,
  sourceLocale,
  onRecognized,
  onRecognizing
}: UseSpeechRecognizerParams) {
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);
  const isStartingRef = useRef(false);

  const stopRecognizer = useCallback(async () => {
    if (recognizerRef.current) {
      console.info('[SpeechRecognizer] Зупинка recognizer...');
      try {
        await new Promise<void>((resolve) => {
          recognizerRef.current?.stopContinuousRecognitionAsync(
            () => {
              recognizerRef.current?.close();
              resolve();
            },
            (err) => {
              console.warn('[SpeechRecognizer] Помилка зупинки:', err);
              resolve();
            }
          );
        });
      } catch (e) {
        console.warn('[SpeechRecognizer] Помилка при закритті:', e);
      }
      recognizerRef.current = null;
    }
  }, []);

  const startRecognizer = useCallback(async () => {
    if (!enabled || !sourceLocale || isStartingRef.current) return;
    
    isStartingRef.current = true;
    console.info('[SpeechRecognizer] Запуск сесії розпізнавання...', { locale: sourceLocale });

    try {
      const activeRecognizer = await createRecognizer(sourceLocale);
      recognizerRef.current = activeRecognizer;

      // Проміжне розпізнавання (preview)
      activeRecognizer.recognizing = (_: any, event: any) => {
        const text = event.result.text;
        if (text && onRecognizing) {
          onRecognizing(text);
        }
      };

      // Фінальне розпізнавання речення
      activeRecognizer.recognized = (_: any, event: any) => {
        if (event.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const text = event.result.text;
          if (text && text.trim().length > 1) {
            console.log('[SpeechRecognizer] Фінальна фраза:', text);
            onRecognized(text);
          }
        }
      };

      activeRecognizer.canceled = (s: any, e: any) => {
        console.warn('[SpeechRecognizer] Скасовано:', e.reason, e.errorDetails);
      };

      activeRecognizer.startContinuousRecognitionAsync(
        () => {
          console.info('[SpeechRecognizer] Розпізнавання активне');
          isStartingRef.current = false;
        },
        (err) => {
          console.error('[SpeechRecognizer] Помилка старту:', err);
          isStartingRef.current = false;
        }
      );
    } catch (err) {
      console.error('[SpeechRecognizer] Помилка ініціалізації:', err);
      isStartingRef.current = false;
    }
  }, [enabled, sourceLocale, onRecognized, onRecognizing]);

  useEffect(() => {
    if (enabled) {
      startRecognizer();
    } else {
      stopRecognizer();
    }

    return () => {
      stopRecognizer();
    };
  }, [enabled, sourceLocale, startRecognizer, stopRecognizer]);

  return { 
    recognizer: recognizerRef.current 
  };
}
