import {
  collection,
  doc,
  serverTimestamp,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';

import {
  DEFAULT_SOURCE_LOCALE,
  DEFAULT_TARGET_LOCALE,
  DEFAULT_TRANSLATION_BOT_STATUS,
  DEFAULT_TRANSLATION_MODE,
  DEFAULT_TRANSLATION_PROVIDER,
  DEFAULT_TRANSLATION_STATUS,
  INITIAL_TRANSLATION_METRICS,
  TRANSLATION_COLLECTION,
  TRANSLATION_SEGMENTS_SUBCOLLECTION,
  buildLanguagePairKey,
} from './constants';

import type {
  CallTranslationDoc,
  TranslationParticipantRole,
  TranslationParticipantState,
  TranslationSegmentDoc,
} from './types';

export interface BuildInitialTranslationParticipantParams {
  uid: string;
  role: TranslationParticipantRole;
  displayName?: string | null;
  sourceLocale?: string;
  targetLocale?: string;
  captionsEnabled?: boolean;
  audioTranslationEnabled?: boolean;
}

export interface BuildInitialTranslationDocParams {
  callId: string;
  callStatus?: CallTranslationDoc['callStatus'];

  roomName?: string | null;
  dailyRoomUrl?: string | null;

  participants: BuildInitialTranslationParticipantParams[];
}

export interface BuildTranslationSegmentParams {
  callId: string;

  speakerUid: string;
  speakerRole: TranslationParticipantRole;
  speakerDisplayName?: string | null;

  sourceLocale: string;
  targetLocale: string;

  originalText: string;
  translatedText: string;

  isFinal: boolean;
  sequence: number;

  latencyMs?: number | null;
  errorCode?: string | null;
}

export function translationDocRef(
  db: Firestore,
  callId: string,
): DocumentReference<CallTranslationDoc> {
  return doc(db, TRANSLATION_COLLECTION, callId) as DocumentReference<CallTranslationDoc>;
}

export function translationSegmentsColRef(
  db: Firestore,
  callId: string,
): CollectionReference<TranslationSegmentDoc> {
  return collection(
    db,
    TRANSLATION_COLLECTION,
    callId,
    TRANSLATION_SEGMENTS_SUBCOLLECTION,
  ) as CollectionReference<TranslationSegmentDoc>;
}

export function buildInitialTranslationParticipant(
  params: BuildInitialTranslationParticipantParams,
): TranslationParticipantState {
  return {
    uid: params.uid,
    role: params.role,
    displayName: params.displayName ?? null,

    sourceLocale: params.sourceLocale ?? DEFAULT_SOURCE_LOCALE,
    targetLocale: params.targetLocale ?? DEFAULT_TARGET_LOCALE,

    captionsEnabled: params.captionsEnabled ?? true,
    audioTranslationEnabled: params.audioTranslationEnabled ?? false,

    joinedAt: null,
    leftAt: null,
    streamStatus: 'idle',
  };
}

export function buildInitialTranslationDoc(
  params: BuildInitialTranslationDocParams,
): Omit<CallTranslationDoc, 'createdAt' | 'updatedAt'> & {
  createdAt: null;
  updatedAt: null;
} {
  if (!params.participants.length) {
    throw new Error('buildInitialTranslationDoc requires at least one participant');
  }

  const participantMap: Record<string, TranslationParticipantState> = {};

  for (const participant of params.participants) {
    participantMap[participant.uid] = buildInitialTranslationParticipant(participant);
  }

  const first = params.participants[0];
  const languagePairKey = buildLanguagePairKey(
    first.sourceLocale ?? DEFAULT_SOURCE_LOCALE,
    first.targetLocale ?? DEFAULT_TARGET_LOCALE,
  );

  return {
    callId: params.callId,
    callStatus: params.callStatus ?? 'accepted',

    enabled: true,
    mode: DEFAULT_TRANSLATION_MODE,
    status: DEFAULT_TRANSLATION_STATUS,
    provider: DEFAULT_TRANSLATION_PROVIDER,
    botStatus: DEFAULT_TRANSLATION_BOT_STATUS,

    source: {
      roomName: params.roomName ?? null,
      dailyRoomUrl: params.dailyRoomUrl ?? null,
    },

    participants: participantMap,

    languagePairKey,

    startedAt: null,
    activatedAt: null,
    endedAt: null,
    lastSegmentAt: null,

    lastError: null,

    metrics: {
      ...INITIAL_TRANSLATION_METRICS,
    },

    createdAt: null,
    updatedAt: null,
  };
}

export function buildTranslationSegment(
  params: BuildTranslationSegmentParams,
): Omit<TranslationSegmentDoc, 'emittedAt'> & {
  emittedAt: any;
} {
  return {
    callId: params.callId,

    speakerUid: params.speakerUid,
    speakerRole: params.speakerRole,
    speakerDisplayName: params.speakerDisplayName ?? null,

    sourceLocale: params.sourceLocale,
    targetLocale: params.targetLocale,

    originalText: params.originalText,
    translatedText: params.translatedText,

    isFinal: params.isFinal,
    sequence: params.sequence,

    startedAt: null,
    emittedAt: serverTimestamp(),
    finalizedAt: params.isFinal ? serverTimestamp() : null,

    latencyMs: params.latencyMs ?? null,

    provider: DEFAULT_TRANSLATION_PROVIDER,
    status: params.isFinal ? 'final' : 'partial',

    errorCode: params.errorCode ?? null,
  };
}

export function buildTranslationErrorPatch(
  code: string,
  message: string,
  source: NonNullable<CallTranslationDoc['lastError']>['source'],
) {
  return {
    status: 'error' as const,
    lastError: {
      code,
      message,
      source,
      at: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  };
}

export function buildTranslationStartingPatch() {
  return {
    status: 'starting' as const,
    botStatus: 'joining' as const,
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function buildTranslationActivePatch() {
  return {
    status: 'active' as const,
    botStatus: 'processing' as const,
    activatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function buildTranslationEndedPatch() {
  return {
    status: 'ended' as const,
    botStatus: 'left' as const,
    endedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function buildTranslationLastSegmentPatch(latencyMs?: number | null) {
  return {
    lastSegmentAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(typeof latencyMs === 'number' ? { 'metrics.maxLatencyMs': latencyMs } : {}),
  };
}
