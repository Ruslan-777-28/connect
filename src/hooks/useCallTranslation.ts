
'use client';

import { useMemoFirebase, useDoc, useCollection } from '@/firebase';
import { query, orderBy, limit } from 'firebase/firestore';
import { translationDocRef, translationSegmentsColRef } from '@/lib/translation/firestore';
import type { CallTranslationDoc, TranslationSegmentDoc } from '@/lib/translation/types';
import { useFirestore } from '@/firebase';

/**
 * Hook to listen to translation state and segments for a specific call.
 * Limits segments to 40 for optimal UI performance.
 */
export function useCallTranslation(callId: string) {
  const firestore = useFirestore();

  // 1. Listen to the main translation document (status, enabled, languages)
  const translationRef = useMemoFirebase(
    () => (callId ? translationDocRef(firestore, callId) : null),
    [firestore, callId]
  );

  const { data: translation, isLoading: isStateLoading } = useDoc<CallTranslationDoc>(translationRef);

  // 2. Listen to the stream of translated segments
  const segmentsQuery = useMemoFirebase(
    () => (callId ? query(
      translationSegmentsColRef(firestore, callId), 
      orderBy('sequence', 'asc'),
      limit(40)
    ) : null),
    [firestore, callId]
  );

  const { data: segments, isLoading: isSegmentsLoading } = useCollection<TranslationSegmentDoc>(segmentsQuery);

  return {
    translation,
    segments,
    isActive: translation?.enabled && translation?.status === 'active',
    status: translation?.status || 'idle',
    isLoading: isStateLoading || isSegmentsLoading,
  };
}
