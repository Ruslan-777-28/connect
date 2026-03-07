import * as speechsdk from "microsoft-cognitiveservices-speech-sdk";
import { createSpeechConfig } from "./speechConfig";

export interface RecognizerOptions {
  locale: string;
}

export function createSpeechRecognizer(options: RecognizerOptions) {
  const speechConfig = createSpeechConfig();

  speechConfig.speechRecognitionLanguage = options.locale;

  // Note: fromDefaultMicrophoneInput is for browser/client use.
  // For server-side worker with Daily, we will use PushAudioInputStream in the next step.
  const audioConfig = speechsdk.AudioConfig.fromDefaultMicrophoneInput();

  const recognizer = new speechsdk.SpeechRecognizer(
    speechConfig,
    audioConfig
  );

  return recognizer;
}
