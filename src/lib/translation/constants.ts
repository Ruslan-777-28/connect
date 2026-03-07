export const SUPPORTED_LOCALES = [
  { code: 'uk-UA', label: 'Українська' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'pl-PL', label: 'Polski' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'es-ES', label: 'Español' },
];

export const DEFAULT_SOURCE_LOCALE = 'uk-UA';
export const DEFAULT_TARGET_LOCALE = 'en-US';

export const TRANSLATION_COLLECTION = 'callTranslations';
export const SEGMENTS_SUBCOLLECTION = 'segments';

export const TRANSLATION_STATUS = {
  IDLE: 'idle',
  STARTING: 'starting',
  ACTIVE: 'active',
  ERROR: 'error',
  ENDED: 'ended',
} as const;

export const BOT_STATUS = {
  NOT_JOINED: 'not_joined',
  JOINING: 'joining',
  JOINED: 'joined',
  PROCESSING: 'processing',
  FAILED: 'failed',
  LEFT: 'left',
} as const;
