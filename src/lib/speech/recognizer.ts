
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

/**
 * Ініціалізує екземпляр Azure Speech Recognizer за допомогою тимчасового токена.
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

  // Встановлюємо мову розпізнавання (наприклад, uk-UA)
  speechConfig.speechRecognitionLanguage = locale;

  // Вмикаємо TrueText для автоматичної пунктуації та нормалізації тексту
  speechConfig.setProperty(
    'SpeechServiceResponse_PostProcessingOption',
    'TrueText'
  );

  // Режим диктування для кращого розпізнавання пауз та природного мовлення
  speechConfig.enableDictation();

  // Використовуємо стандартний мікрофон
  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

  const recognizer = new SpeechSDK.SpeechRecognizer(
    speechConfig,
    audioConfig
  );

  return recognizer;
}
