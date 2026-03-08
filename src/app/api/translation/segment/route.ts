
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
    return text; 
  }
}

/**
 * Processes a recognized speech segment using the "Speculative Captions" trick.
 * 1. Immediate transaction to write original text (UI sees it instantly).
 * 2. Background translation call.
 * 3. Update segment with translated text.
 */
export async function POST(request: NextRequest) {
  try {
    const { callId, speakerId, text } = await request.json();

    if (!text?.trim()) {
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
    // Handle both array and map formats for robustness
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
    // The UI will see this segment immediately because of the Firestore listener
    const { sequence, segmentDocRef } = await adminDb.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(translationRef);
      if (!freshSnap.exists) throw new Error('Session disappeared');
      
      const data = freshSnap.data()!;
      const currentSequence = data.nextSequence || 1;

      const segmentsRef = translationRef.collection('segments');
      const docRef = segmentsRef.doc(`seg_${currentSequence.toString().padStart(6, '0')}`);

      const initialSegment = {
        callId,
        speakerUid: speakerId,
        speakerRole: speakerData.role,
        speakerDisplayName: speakerData.displayName,
        sourceLocale: speakerData.sourceLocale,
        targetLocale: speakerData.targetLocale,
        originalText: text,
        translatedText: '', // Empty initially
        isFinal: true,
        sequence: currentSequence,
        emittedAt: FieldValue.serverTimestamp(),
        finalizedAt: null,
        provider: 'azure_speech',
        status: 'partial', // 'partial' means translation pending in our logic
      };

      transaction.set(docRef, initialSegment);
      transaction.update(translationRef, {
        nextSequence: currentSequence + 1,
        'metrics.totalSegments': FieldValue.increment(1),
        lastSegmentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { sequence: currentSequence, segmentDocRef: docRef };
    });

    // PHASE 2: Background Translation
    // We don't await this before returning 200 to the client, 
    // but in serverless we must ensure it finishes.
    const translatedText = await translateText(text, speakerData.targetLocale);

    // PHASE 3: Update with final translation
    await segmentDocRef.update({
      translatedText,
      status: 'final',
      finalizedAt: FieldValue.serverTimestamp(),
      'metrics.finalSegments': FieldValue.increment(1),
    });

    return NextResponse.json({ ok: true, sequence });
  } catch (error: any) {
    console.error('[TranslationSegment] failed:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
