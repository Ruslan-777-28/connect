import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * Performs translation using Azure Translator API v3.0.
 * Supports multiple target languages in one request (fan-out).
 */
async function translateText(
  text: string,
  targetLocales: string[]
): Promise<Record<string, string>> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;

  if (!key) {
    throw new Error('AZURE_TRANSLATOR_KEY missing');
  }

  const uniqueLocales = [...new Set(targetLocales.filter(Boolean))];
  const toCodes = uniqueLocales.map((locale) => locale.split('-')[0]);

  console.info('[Translator] Request', {
    text,
    targetLocales: uniqueLocales,
    toCodes,
    region: region || '(none)',
  });

  const endpoint =
    'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0';

  const headers: Record<string, string> = {
    'Ocp-Apim-Subscription-Key': key,
    'Content-Type': 'application/json',
  };

  if (region) {
    headers['Ocp-Apim-Subscription-Region'] = region;
  }

  const url = `${endpoint}${toCodes.map((c) => `&to=${encodeURIComponent(c)}`).join('')}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify([{ Text: text }]),
  });

  const raw = await res.text();

  console.info('[Translator] Response status', res.status);

  if (!res.ok) {
    throw new Error(`Azure Translator error ${res.status}: ${raw}`);
  }

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Translator returned non-JSON body: ${raw}`);
  }

  const result: Record<string, string> = {};

  if (json?.[0]?.translations?.length) {
    for (const locale of uniqueLocales) {
      const short = locale.split('-')[0];
      const hit = json[0].translations.find((t: any) => t.to === short);
      if (hit?.text) {
        result[locale] = hit.text;
      }
    }
  }

  console.info('[Translator] Parsed translations', result);

  if (Object.keys(result).length === 0) {
    throw new Error('Translator returned empty translations map');
  }

  return result;
}

/**
 * Processes a recognized speech segment using the "Speculative Captions" pattern.
 * This version ensures sequential processing: 
 * 1. Transactional write of original text.
 * 2. Async Azure translation.
 * 3. Final update of the same document.
 * 4. Response only after all steps are complete.
 */
export async function POST(request: NextRequest) {
  try {
    let payload: any = null;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid or empty JSON body' },
        { status: 400 }
      );
    }

    const { callId, speakerId, text } = payload || {};
    const cleanText = typeof text === 'string' ? text.trim() : '';

    if (!callId || !speakerId || !cleanText) {
      return NextResponse.json(
        { error: 'Missing required fields: callId, speakerId, text' },
        { status: 400 }
      );
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
    const speakerData = participants[speakerId];

    if (!speakerData) {
      return NextResponse.json({ error: 'Speaker config not found' }, { status: 404 });
    }

    let currentSequence = 0;
    let segmentId = '';

    // STEP 1: Immediate Transactional Write (Original Text Only)
    await adminDb.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(translationRef);
      if (!freshSnap.exists) throw new Error('Session disappeared');
      
      const data = freshSnap.data()!;
      currentSequence = data.nextSequence || (data.metrics?.totalSegments || 0) + 1;
      segmentId = `seg_${currentSequence.toString().padStart(6, '0')}`;
      const segmentDocRef = translationRef.collection('segments').doc(segmentId);

      const initialSegment = {
        callId,
        speakerUid: speakerId,
        speakerRole: speakerData.role,
        speakerDisplayName: speakerData.displayName,
        sourceLocale: speakerData.sourceLocale,
        targetLocale: speakerData.targetLocale,
        originalText: cleanText,
        translations: {}, 
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

    const segmentRef = translationRef.collection('segments').doc(segmentId);

    // STEP 2: Async Translation
    const targetLocales = [speakerData.targetLocale];
    const translations = await translateText(cleanText, targetLocales);

    // STEP 3: Final Update of the same document
    await segmentRef.update({
      translations,
      isFinal: true,
      status: 'final',
      finalizedAt: FieldValue.serverTimestamp(),
    });

    // STEP 4: Update global metrics
    await translationRef.update({
      'metrics.finalSegments': FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // FINAL STEP: Return response only after database is fully updated
    return NextResponse.json({
      ok: true,
      sequence: currentSequence,
      translations,
    });
  } catch (error: any) {
    console.error('[TranslationSegment] Global processing failed:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
