
'use client';

import { useMemoFirebase, useDoc, useCollection } from '@/firebase';
import { query, orderBy, limit } from 'firebase/firestore';
import { translationDocRef, translationSegmentsColRef } from '@/lib/translation/firestore';
import type { CallTranslationDoc, TranslationSegmentDoc } from '@/lib/translation/types';
import { useFirestore } from '@/firebase';
import { useMemo } from 'react';

/**
 * Hook to listen to translation state and segments for a specific call.
 * Uses 'desc' + limit(40) then reverses to get the latest 40 segments in correct order.
 */
export function useCallTranslation(callId: string) {
  const firestore = useFirestore();

  // 1. Listen to the main translation document (status, enabled, languages)
  const translationRef = useMemoFirebase(
    () => (callId ? translationDocRef(firestore, callId) : null),
    [firestore, callId]
  );

  const { data: translation, isLoading: isStateLoading } = useDoc<CallTranslationDoc>(translationRef);

  // 2. Listen to the stream of translated segments (last 40)
  const segmentsQuery = useMemoFirebase(
    () => (callId ? query(
      translationSegmentsColRef(firestore, callId), 
      orderBy('sequence', 'desc'),
      limit(40)
    ) : null),
    [firestore, callId]
  );

  const { data: rawSegments, isLoading: isSegmentsLoading } = useCollection<TranslationSegmentDoc>(segmentsQuery);

  // 3. Reverse segments to display them in chronological order (oldest at top, newest at bottom)
  const segments = useMemo(() => {
    if (!rawSegments) return null;
    return [...rawSegments].reverse();
  }, [rawSegments]);

  return {
    translation,
    segments,
    isActive: translation?.enabled && translation?.status === 'active',
    status: translation?.status || 'idle',
    isLoading: isStateLoading || isSegmentsLoading,
  };
}
