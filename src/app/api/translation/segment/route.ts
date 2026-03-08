import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * Performs translation using Azure Translator API v3.0.
 * Uses regional resources if configured.
 */
async function translateText(text: string, targetLocale: string): Promise<string> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  
  if (!key) {
    console.warn('[Translator] AZURE_TRANSLATOR_KEY missing, returning original text');
    return text;
  }

  const endpoint = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0";
  const to = targetLocale.split('-')[0]; // Simple BCP-47 to language code mapping (e.g., uk-UA -> uk)

  try {
    const res = await fetch(`${endpoint}&to=${to}`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        ...(region ? { "Ocp-Apim-Subscription-Region": region } : {}),
        "Content-Type": "application/json"
      },
      body: JSON.stringify([{ Text: text }])
    });

    if (!res.ok) {
      throw new Error(`Azure Translator Error: ${res.status}`);
    }

    const json = await res.json();
    return json[0].translations[0].text;
  } catch (error) {
    console.error('[Translator] Azure Translation failed:', error);
    return text; // Fallback to original text on failure
  }
}

/**
 * Processes a recognized speech segment: translates it and stores in Firestore.
 * Uses atomic transaction to manage global sequence number.
 */
export async function POST(request: NextRequest) {
  try {
    const { callId, speakerId, text } = await request.json();

    // Guard: ignore empty or whitespace-only text
    if (!text?.trim()) {
      return NextResponse.json({ ok: true, skipped: 'empty' });
    }

    if (!callId || !speakerId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Fetch translation context
    const translationRef = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);
    const translationSnap = await translationRef.get();

    if (!translationSnap.exists) {
      return NextResponse.json({ error: 'Translation session not found' }, { status: 404 });
    }

    const translationData = translationSnap.data()!;
    
    // Guard: ensure translation is actually enabled for this session
    if (!translationData.enabled) {
      return NextResponse.json({ error: 'Translation disabled' }, { status: 403 });
    }

    const participants = translationData.participants || {};
    const speakerData = participants[speakerId];

    if (!speakerData) {
      return NextResponse.json({ error: 'Speaker configuration not found' }, { status: 404 });
    }

    // 2. Perform translation
    const translatedText = await translateText(text, speakerData.targetLocale);

    // 3. Atomic Transaction for Sequence + Metrics
    const result = await adminDb.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(translationRef);
      if (!freshSnap.exists) throw new Error('Session disappeared during transaction');
      
      const data = freshSnap.data()!;
      // Use nextSequence counter for guaranteed order
      const currentSequence = data.nextSequence || 1;

      const segmentsRef = translationRef.collection('segments');
      const segmentDocRef = segmentsRef.doc(`seg_${currentSequence.toString().padStart(6, '0')}`);

      const segmentData = {
        callId,
        speakerUid: speakerId,
        speakerRole: speakerData.role,
        speakerDisplayName: speakerData.displayName,
        sourceLocale: speakerData.sourceLocale,
        targetLocale: speakerData.targetLocale,
        originalText: text,
        translatedText,
        isFinal: true,
        sequence: currentSequence,
        emittedAt: FieldValue.serverTimestamp(),
        finalizedAt: FieldValue.serverTimestamp(),
        provider: 'azure_speech',
        status: 'final',
      };

      transaction.set(segmentDocRef, segmentData);
      transaction.update(translationRef, {
        nextSequence: currentSequence + 1,
        'metrics.totalSegments': currentSequence,
        'metrics.finalSegments': FieldValue.increment(1),
        lastSegmentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { translatedText, sequence: currentSequence };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[TranslationSegment] Processing failed:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
