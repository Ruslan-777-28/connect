import 'dotenv/config';

import type { WorkerConfig } from './types';

function normalizeMultilineEnv(value: string | undefined): string | null {
  if (!value) return null;
  return value.replace(/\\n/g, '\n');
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  internalTranslatorSecret: process.env.INTERNAL_TRANSLATOR_SECRET ?? null,

  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? null,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? null,
  firebasePrivateKey: normalizeMultilineEnv(process.env.FIREBASE_PRIVATE_KEY),

  azureSpeechKey: process.env.AZURE_SPEECH_KEY ?? null,
  azureSpeechRegion: process.env.AZURE_SPEECH_REGION ?? null,

  dailyApiKey: process.env.DAILY_API_KEY ?? null,
  dailyBotName: process.env.DAILY_BOT_NAME ?? 'Translator Bot',
  
  // Audio format constraints for Azure
  audioSampleRate: Number(process.env.TRANSLATION_AUDIO_SAMPLE_RATE ?? 16000),
  audioChannels: Number(process.env.TRANSLATION_AUDIO_CHANNELS ?? 1),
};

export function assertRequiredConfig() {
  const missing: string[] = [];

  if (!config.firebaseProjectId) missing.push('FIREBASE_PROJECT_ID');
  if (!config.firebaseClientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
  if (!config.firebasePrivateKey) missing.push('FIREBASE_PRIVATE_KEY');

  if (!config.internalTranslatorSecret) {
    missing.push('INTERNAL_TRANSLATOR_SECRET');
  }

  if (!config.dailyApiKey) missing.push('DAILY_API_KEY');

  if (missing.length) {
    throw new Error(`Missing required worker env vars: ${missing.join(', ')}`);
  }
}