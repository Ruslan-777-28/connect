import * as speechsdk from "microsoft-cognitiveservices-speech-sdk";
import { config } from "../config";

export function createSpeechConfig() {
  if (!config.azureSpeechKey || !config.azureSpeechRegion) {
    throw new Error("Azure Speech config missing");
  }

  const speechConfig = speechsdk.SpeechConfig.fromSubscription(
    config.azureSpeechKey,
    config.azureSpeechRegion
  );

  // Default recognition language
  speechConfig.speechRecognitionLanguage = "en-US";

  return speechConfig;
}
