
import type { Timestamp, DocumentData } from 'firebase/firestore';

export type TranslationProvider = 'azure_speech';

export type TranslationMode = 'captions_only' | 'voice_translation';

export type TranslationStatus =
  | 'idle'
  | 'starting'
  | 'active'
  | 'error'
  | 'ended';

export type TranslationBotStatus =
  | 'not_joined'
  | 'joining'
  | 'joined'
  | 'processing'
  | 'failed'
  | 'left'
  | 'disabled';

export type TranslationSegmentStatus = 'partial' | 'final' | 'error';

export type TranslationErrorSource =
  | 'bot'
  | 'azure'
  | 'daily'
  | 'firestore'
  | null;

export type TranslationParticipantRole = 'caller' | 'callee';

export interface TranslationParticipantState {
  uid: string;
  role: TranslationParticipantRole;
  displayName: string | null;

  sourceLocale: string;
  targetLocale: string;

  captionsEnabled: boolean;
  audioTranslationEnabled: boolean;

  joinedAt: Timestamp | null;
  leftAt: Timestamp | null;

  streamStatus: 'idle' | 'listening' | 'muted' | 'disconnected' | 'error';
}

export interface TranslationErrorInfo {
  code: string | null;
  message: string | null;
  source: TranslationErrorSource;
  at: Timestamp | null;
}

export interface TranslationMetrics {
  totalSegments: number;
  finalSegments: number;
  partialSegments: number;
  droppedSegments: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number | null;
}

export interface TranslationSourceInfo {
  roomName: string | null;
  dailyRoomUrl: string | null;
}

export interface CallTranslationDoc {
  callId: string;
  callStatus: 'pending' | 'accepted' | 'active' | 'ended' | 'missed';

  enabled: boolean;
  mode: TranslationMode;
  status: TranslationStatus;
  provider: TranslationProvider;
  botStatus: TranslationBotStatus;

  source: TranslationSourceInfo;

  participants: Record<string, TranslationParticipantState>;

  languagePairKey: string;
  
  /** 
   * Server-side sequence counter for guaranteed ordering of segments.
   */
  nextSequence: number;

  startedAt: Timestamp | null;
  activatedAt: Timestamp | null;
  endedAt: Timestamp | null;
  lastSegmentAt: Timestamp | null;

  lastError: TranslationErrorInfo | null;

  metrics: TranslationMetrics;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TranslationSegmentDoc {
  callId: string;

  speakerUid: string;
  speakerRole: TranslationParticipantRole;
  speakerDisplayName: string | null;

  sourceLocale: string;
  targetLocale: string;

  originalText: string;
  /**
   * Multi-target translation map.
   * Can be empty initially (Speculative Captions).
   */
  translations: Record<string, string>;

  isFinal: boolean;
  sequence: number;

  startedAt: Timestamp | null;
  emittedAt: Timestamp;
  finalizedAt: Timestamp | null;

  latencyMs: number | null;

  provider: TranslationProvider;
  status: TranslationSegmentStatus;

  errorCode: string | null;
}

export type CallTranslationDocInput = Omit<
  CallTranslationDoc,
  'createdAt' | 'updatedAt'
> & {
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type TranslationSegmentDocInput = Omit<TranslationSegmentDoc, 'emittedAt'> & {
  emittedAt?: Timestamp;
};

export function isCallTranslationDoc(value: DocumentData | undefined): value is CallTranslationDoc {
  return !!value && typeof value.callId === 'string' && typeof value.enabled === 'boolean';
}

export function isTranslationSegmentDoc(
  value: DocumentData | undefined,
): value is TranslationSegmentDoc {
  return !!value && typeof value.speakerUid === 'string' && typeof value.sequence === 'number';
}
