import * as speechsdk from "microsoft-cognitiveservices-speech-sdk";
import { createSpeechConfig } from "./speechConfig";

export function createSpeechSynth(locale: string) {
  const speechConfig = createSpeechConfig();

  speechConfig.speechSynthesisLanguage = locale;

  const audioConfig = speechsdk.AudioConfig.fromDefaultSpeakerOutput();

  return new speechsdk.SpeechSynthesizer(
    speechConfig,
    audioConfig
  );
}
