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
 * Включає гібридну буферизацію фраз (1.8с).
 */
export function useSpeechRecognizer({
  enabled,
  sourceLocale,
  onRecognized,
  onRecognizing
}: UseSpeechRecognizerParams) {
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);
  const isStartingRef = useRef(false);
  
  // Buffering logic
  const bufferRef = useRef("");
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);

  const flushBuffer = useCallback(() => {
    const text = bufferRef.current.trim();
    if (text.length > 1) {
      console.log('[SpeechRecognizer] Flushing buffer:', text);
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
      console.info('[SpeechRecognizer] Зупинка recognizer...');
      try {
        // Force flush buffer before stopping
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
              console.warn('[SpeechRecognizer] Помилка зупинки:', err);
              resolve();
            }
          );
        });
      } catch (e) {
        console.warn('[SpeechRecognizer] Помилка при закритті:', e);
      }
    }
  }, [flushBuffer]);

  const startRecognizer = useCallback(async () => {
    if (!enabled || !sourceLocale || isStartingRef.current) return;
    
    isStartingRef.current = true;
    console.info('[SpeechRecognizer] Запуск сесії розпізнавання...', { locale: sourceLocale });

    try {
      const activeRecognizer = await createRecognizer(sourceLocale);
      recognizerRef.current = activeRecognizer;

      // Проміжне розпізнавання (preview) - додаємо throttle
      activeRecognizer.recognizing = (_: any, event: any) => {
        const text = event.result.text;
        if (text && text.length >= 2 && onRecognizing) {
          onRecognizing(text);
        }
      };

      // Подія розпізнаної фрази (Chunk)
      activeRecognizer.recognized = (_: any, event: any) => {
        if (event.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const text = event.result.text;
          if (text && text.trim().length > 1) {
            bufferRef.current += " " + text.trim();
            
            // Якщо речення закінчилось пунктуацією - флашимо миттєво
            if (/[.?!]$/.test(text.trim())) {
              flushBuffer();
            } else {
              scheduleFlush();
            }
          }
        }
      };

      activeRecognizer.canceled = (s: any, e: any) => {
        console.warn('[SpeechRecognizer] Сесію скасовано:', e.reason, e.errorDetails);
        isStartingRef.current = false;
      };

      activeRecognizer.sessionStopped = () => {
        console.info('[SpeechRecognizer] Сесію завершено Azure');
        isStartingRef.current = false;
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
  }, [enabled, sourceLocale, onRecognizing, flushBuffer, scheduleFlush]);

  useEffect(() => {
    // Force stop before starting a new one (prevents leaks on locale change)
    stopRecognizer();

    if (enabled) {
      startRecognizer();
    }

    return () => {
      stopRecognizer();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [enabled, sourceLocale]); // Removed startRecognizer/stopRecognizer from deps to avoid re-triggering logic

  return { 
    recognizer: recognizerRef.current 
  };
}
