import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * Performs translation using Azure Translator API v3.0.
 * Supports multiple target languages in one request (fan-out).
 */
async function translateText(text: string, targetLocales: string[]): Promise<Record<string, string>> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  
  if (!key) {
    console.warn('[Translator] AZURE_TRANSLATOR_KEY missing, returning empty translations');
    return {};
  }

  // Build fan-out query params: &to=en&to=uk&to=pl
  const toParams = targetLocales
    .map(loc => `to=${loc.split('-')[0]}`)
    .join('&');

  const endpoint = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&${toParams}`;

  const headers: Record<string, string> = {
    "Ocp-Apim-Subscription-Key": key,
    "Content-Type": "application/json"
  };

  if (region) {
    headers["Ocp-Apim-Subscription-Region"] = region;
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify([{ Text: text }])
    });

    if (!res.ok) {
      throw new Error(`Azure Translator Error: ${res.status}`);
    }

    const json = await res.json();
    const results: Record<string, string> = {};

    if (json?.[0]?.translations) {
      json[0].translations.forEach((t: any) => {
        const fullLocale = targetLocales.find(loc => loc.startsWith(t.to)) || t.to;
        results[fullLocale] = t.text;
      });
    }

    return results;
  } catch (error) {
    console.error('[Translator] Azure Translation failed:', error);
    return {}; 
  }
}

/**
 * Processes a recognized speech segment using the "Speculative Captions" trick.
 * 1. Immediate transactional write of original text (Zero Latency UI).
 * 2. Background translation call.
 * 3. Update segment with translations.
 */
export async function POST(request: NextRequest) {
  try {
    const { callId, speakerId, text } = await request.json();

    const cleanText = text?.trim();
    if (!cleanText) {
      return NextResponse.json({ ok: true, skipped: 'empty' });
    }

    if (!callId || !speakerId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const translationRef = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);
    const translationSnap = await translationRef.get();

    if (!translationSnap.exists) {
      return NextResponse.json({ error: 'Translation session not found' }, { status: 404 });
    }

    const translationData = translationSnap.data()!;
    if (!translationData.enabled) {
      return NextResponse.json({ error: 'Translation disabled' }, { status: 403 });
    }

    const participants = translationData.participants || {};
    let speakerData;
    if (Array.isArray(participants)) {
      speakerData = participants.find((p: any) => p.uid === speakerId);
    } else {
      speakerData = participants[speakerId];
    }

    if (!speakerData) {
      return NextResponse.json({ error: 'Speaker not found' }, { status: 404 });
    }

    // PHASE 1: Immediate Transactional Write (Original Text)
    // UI will show original text with "Translating..." status instantly.
    let currentSequence = 0;
    const segmentsRef = translationRef.collection('segments');
    let segmentDocRef: FirebaseFirestore.DocumentReference;

    await adminDb.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(translationRef);
      if (!freshSnap.exists) throw new Error('Session disappeared');
      
      const data = freshSnap.data()!;
      currentSequence = data.nextSequence || 1;
      segmentDocRef = segmentsRef.doc(`seg_${currentSequence.toString().padStart(6, '0')}`);

      const initialSegment = {
        callId,
        speakerUid: speakerId,
        speakerRole: speakerData.role,
        speakerDisplayName: speakerData.displayName,
        sourceLocale: speakerData.sourceLocale,
        targetLocale: speakerData.targetLocale,
        originalText: cleanText,
        translations: {}, // Empty initially
        isFinal: false,
        sequence: currentSequence,
        emittedAt: FieldValue.serverTimestamp(),
        finalizedAt: null,
        provider: 'azure_speech',
        status: 'partial',
      };

      transaction.set(segmentDocRef, initialSegment);
      transaction.update(translationRef, {
        nextSequence: currentSequence + 1,
        'metrics.totalSegments': FieldValue.increment(1),
        lastSegmentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // PHASE 2: Multi-target Background Translation
    const targetLocales = [speakerData.targetLocale];
    const translations = await translateText(cleanText, targetLocales);

    // PHASE 3: Update with final translations
    await segmentDocRef!.update({
      translations,
      isFinal: true,
      status: 'final',
      finalizedAt: FieldValue.serverTimestamp(),
    });

    await translationRef.update({
      'metrics.finalSegments': FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, sequence: currentSequence });
  } catch (error: any) {
    console.error('[TranslationSegment] failed:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
