import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * Performs translation using Azure Translator API v3.0.
 * Supports multiple target languages in one request (fan-out).
 * Maps short language codes back to full BCP-47 locales.
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
  console.info('[Translator] Response body', raw);

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
    // map response back to full locale keys (uk-UA, en-US, ...)
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
 * 1. Immediate transactional write of original text (Zero Latency UI).
 * 2. Background translation call.
 * 3. Update segment with translations and finalize status only if successful.
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

    // PHASE 1: Immediate Transactional Write (Original Text Only)
    // This RESERVES the sequence number and puts the text on screen ASAP.
    let currentSequence = 0;
    let segmentDocRef: FirebaseFirestore.DocumentReference;

    await adminDb.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(translationRef);
      if (!freshSnap.exists) throw new Error('Session disappeared');
      
      const data = freshSnap.data()!;
      currentSequence = data.nextSequence || (data.metrics?.totalSegments || 0) + 1;
      segmentDocRef = translationRef.collection('segments').doc(`seg_${currentSequence.toString().padStart(6, '0')}`);

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

    // PHASE 2 & 3: Background Translation & Finalization
    // We only finalize the segment if translation succeeds.
    try {
      const targetLocales = [speakerData.targetLocale];
      const translations = await translateText(cleanText, targetLocales);

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
    } catch (translateError) {
      console.error('[TranslationSegment] Background translation failed:', translateError);
      // Segment remains in 'partial' status so user still sees the original text.
    }

    return NextResponse.json({ ok: true, sequence: currentSequence });
  } catch (error: any) {
    console.error('[TranslationSegment] Processing failed:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
