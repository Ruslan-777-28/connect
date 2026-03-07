'use client';

import { doc, collection, Firestore } from 'firebase/firestore';
import { TRANSLATION_COLLECTION, SEGMENTS_SUBCOLLECTION } from './constants';

/**
 * Повертає посилання на документ стану перекладу для конкретного дзвінка.
 */
export function getTranslationDocRef(db: Firestore, callId: string) {
  return doc(db, TRANSLATION_COLLECTION, callId);
}

/**
 * Повертає посилання на підколекцію сегментів перекладу.
 */
export function getSegmentsColRef(db: Firestore, callId: string) {
  return collection(db, TRANSLATION_COLLECTION, callId, SEGMENTS_SUBCOLLECTION);
}
