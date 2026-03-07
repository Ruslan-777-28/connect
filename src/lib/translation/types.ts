import type { Timestamp } from 'firebase/firestore';

export type TranslationMode = 'captions_only' | 'voice_translation';

export type TranslationStatus = 'idle' | 'starting' | 'active' | 'error' | 'ended';

export type TranslationBotStatus = 'not_joined' | 'joining' | 'joined' | 'processing' | 'failed' | 'left';

export interface TranslationParticipant {
  uid: string;
  role: 'caller' | 'callee';
  sourceLocale: string;
  targetLocale: string;
  captionsEnabled: boolean;
  audioTranslationEnabled: boolean;
}

export interface CallTranslation {
  id: string; // matches callId
  callId: string;
  enabled: boolean;
  mode: TranslationMode;
  status: TranslationStatus;
  provider: 'azure_speech';
  botStatus: TranslationBotStatus;
  participants: Record<string, TranslationParticipant>;
  lastError?: {
    code: string | null;
    message: string | null;
    source: 'bot' | 'azure' | 'daily' | 'firestore' | null;
  };
  startedAt?: Timestamp | any;
  activatedAt?: Timestamp | any;
  endedAt?: Timestamp | any;
  createdAt: Timestamp | any;
  updatedAt: Timestamp | any;
}

export interface TranslationSegment {
  id: string;
  speakerUid: string;
  speakerRole: 'caller' | 'callee';
  sourceLocale: string;
  targetLocale: string;
  originalText: string;
  translatedText: string;
  isFinal: boolean;
  sequence: number;
  status: 'partial' | 'final' | 'error';
  latencyMs: number | null;
  emittedAt: Timestamp | any;
  finalizedAt?: Timestamp | any;
}
