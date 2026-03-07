import * as speechsdk from "microsoft-cognitiveservices-speech-sdk";
import { createSpeechConfig } from "./speechConfig";

export interface TranslationResult {
  originalText: string;
  translatedText: string;
}

/**
 * Utility to perform a one-off translation of a single string.
 * Used for testing the Azure connection.
 */
export async function translateText(
  text: string,
  sourceLocale: string,
  targetLocale: string
): Promise<TranslationResult> {
  const speechConfig = createSpeechConfig();

  const translationConfig = speechsdk.SpeechTranslationConfig.fromSubscription(
    speechConfig.subscriptionKey,
    speechConfig.region
  );

  translationConfig.speechRecognitionLanguage = sourceLocale;
  translationConfig.addTargetLanguage(targetLocale);

  // We'll use a recognizer configured for string input if possible, 
  // but for simple testing, we'll mimic the SDK pattern.
  const recognizer = new speechsdk.TranslationRecognizer(translationConfig);

  return new Promise((resolve, reject) => {
    // In a real scenario we'd use a PushStream, but for a simple "test key" call:
    recognizer.recognizeOnceAsync(
      (result) => {
        if (result.reason === speechsdk.ResultReason.TranslatedSpeech) {
          const translated = result.translations.get(targetLocale);
          resolve({
            originalText: result.text,
            translatedText: translated || "",
          });
        } else if (result.reason === speechsdk.ResultReason.NoMatch) {
          reject(new Error("No speech could be recognized."));
        } else if (result.reason === speechsdk.ResultReason.Canceled) {
          const cancellation = speechsdk.CancellationDetails.fromResult(result);
          reject(new Error(`Canceled: ${cancellation.reason}. ${cancellation.errorDetails}`));
        } else {
          reject(new Error(`Translation failed with reason: ${result.reason}`));
        }
        recognizer.close();
      },
      (err) => {
        recognizer.close();
        reject(err);
      }
    );
  });
}
