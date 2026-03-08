
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * Performs translation using Azure Translator API v3.0.
 */
async function translateText(text: string, targetLocale: string): Promise<string> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  
  if (!key) {
    console.warn('[Translator] AZURE_TRANSLATOR_KEY missing, returning original text');
    return text;
  }

  const endpoint = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0";
  const to = targetLocale.split('-')[0];

  try {
    const res = await fetch(`${endpoint}&to=${to}`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region || "",
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
    return text; 
  }
}

/**
 * Processes a speech segment: translates and stores in Firestore with atomic sequence management.
 */
export async function POST(request: NextRequest) {
  try {
    const { callId, speakerId, text } = await request.json();

    if (!callId || !speakerId || !text) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Server-side translation first
    const translationRef = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);
    const translationSnap = await translationRef.get();

    if (!translationSnap.exists) {
      return NextResponse.json({ error: 'Translation session not found' }, { status: 404 });
    }

    const translationData = translationSnap.data()!;
    const speakerData = translationData.participants?.[speakerId];

    if (!speakerData) {
      return NextResponse.json({ error: 'Speaker configuration not found' }, { status: 404 });
    }

    // 1. Perform translation
    const translatedText = await translateText(text, speakerData.targetLocale);

    // 2. Transactional Write for Sequence + Metrics
    const result = await adminDb.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(translationRef);
      if (!freshSnap.exists) throw new Error('Session disappeared during transaction');
      
      const currentMetrics = freshSnap.data()?.metrics || { totalSegments: 0 };
      const nextSequence = (currentMetrics.totalSegments || 0) + 1;

      const segmentsRef = translationRef.collection('segments');
      const segmentDocRef = segmentsRef.doc(`seg_${nextSequence.toString().padStart(6, '0')}`);

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
        sequence: nextSequence,
        emittedAt: FieldValue.serverTimestamp(),
        finalizedAt: FieldValue.serverTimestamp(),
        provider: 'azure_speech',
        status: 'final',
      };

      transaction.set(segmentDocRef, segmentData);
      transaction.update(translationRef, {
        'metrics.totalSegments': nextSequence,
        'metrics.finalSegments': FieldValue.increment(1),
        lastSegmentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { translatedText, sequence: nextSequence };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[TranslationSegment] Processing failed:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
