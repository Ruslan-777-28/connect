export type WorkerTranslationStatus =
  | 'idle'
  | 'starting'
  | 'active'
  | 'error'
  | 'ended';

export type WorkerBotStatus =
  | 'not_joined'
  | 'joining'
  | 'joined'
  | 'processing'
  | 'failed'
  | 'left';

export interface WorkerParticipant {
  uid: string;
  role: 'caller' | 'callee';
  displayName?: string | null;
  sourceLocale?: string;
  targetLocale?: string;
  captionsEnabled?: boolean;
  audioTranslationEnabled?: boolean;
}

export interface TranslationStartPayload {
  callId: string;
  roomName?: string | null;
  dailyRoomUrl?: string | null;
  participants: WorkerParticipant[];
}

export interface TranslationStopPayload {
  callId: string;
  reason?: string;
}

export interface WorkerConfig {
  port: number;
  internalTranslatorSecret: string | null;

  firebaseProjectId: string | null;
  firebaseClientEmail: string | null;
  firebasePrivateKey: string | null;

  azureSpeechKey: string | null;
  azureSpeechRegion: string | null;
}