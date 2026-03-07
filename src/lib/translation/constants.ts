import type {
  TranslationBotStatus,
  TranslationMode,
  TranslationProvider,
  TranslationSegmentStatus,
  TranslationStatus,
} from './types';

export const TRANSLATION_COLLECTION = 'callTranslations';
export const TRANSLATION_SEGMENTS_SUBCOLLECTION = 'segments';

export const DEFAULT_TRANSLATION_PROVIDER: TranslationProvider = 'azure_speech';
export const DEFAULT_TRANSLATION_MODE: TranslationMode = 'captions_only';

export const DEFAULT_SOURCE_LOCALE = 'uk-UA';
export const DEFAULT_TARGET_LOCALE = 'en-US';

export const SUPPORTED_TRANSLATION_LOCALES = ['uk-UA', 'en-US'] as const;

export const DEFAULT_TRANSLATION_STATUS: TranslationStatus = 'idle';
export const DEFAULT_TRANSLATION_BOT_STATUS: TranslationBotStatus = 'not_joined';
export const DEFAULT_TRANSLATION_SEGMENT_STATUS: TranslationSegmentStatus = 'partial';

export const TRANSLATION_STATUSES: readonly TranslationStatus[] = [
  'idle',
  'starting',
  'active',
  'error',
  'ended',
] as const;

export const TRANSLATION_BOT_STATUSES: readonly TranslationBotStatus[] = [
  'not_joined',
  'joining',
  'joined',
  'processing',
  'failed',
  'left',
] as const;

export const TRANSLATION_SEGMENT_STATUSES: readonly TranslationSegmentStatus[] = [
  'partial',
  'final',
  'error',
] as const;

export const TRANSLATION_STREAM_STATUSES = [
  'idle',
  'listening',
  'muted',
  'disconnected',
  'error',
] as const;

export const TRANSLATION_CALL_STATUSES = [
  'pending',
  'accepted',
  'active',
  'ended',
  'missed',
] as const;

export const INITIAL_TRANSLATION_METRICS = {
  totalSegments: 0,
  finalSegments: 0,
  partialSegments: 0,
  droppedSegments: 0,
  avgLatencyMs: null,
  maxLatencyMs: null,
} as const;

export function buildLanguagePairKey(sourceLocale: string, targetLocale: string): string {
  return `${sourceLocale}__${targetLocale}`;
}

export function isSupportedTranslationLocale(locale: string): boolean {
  return SUPPORTED_TRANSLATION_LOCALES.includes(
    locale as (typeof SUPPORTED_TRANSLATION_LOCALES)[number],
  );
}
