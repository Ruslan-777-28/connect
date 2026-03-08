
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

/**
 * Initializes an Azure Speech Recognizer instance using a temporary token.
 */
export async function createRecognizer(locale: string) {
  const tokenRes = await fetch('/api/speech/token');
  const { token, region, error } = await tokenRes.json();

  if (error) {
    throw new Error(error);
  }

  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
    token,
    region
  );

  speechConfig.speechRecognitionLanguage = locale;

  // Enable TrueText for punctuation, capitalization and sentence normalization
  speechConfig.setProperty(
    'SpeechServiceResponse_PostProcessingOption',
    'TrueText'
  );

  // Enable dictation mode for more natural handling of pauses and phrasing
  speechConfig.enableDictation();

  // Use the default microphone input for recording
  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

  const recognizer = new SpeechSDK.SpeechRecognizer(
    speechConfig,
    audioConfig
  );

  return recognizer;
}
