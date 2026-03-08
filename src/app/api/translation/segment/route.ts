
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * Performs translation using Azure Translator API.
 */
async function translateText(text: string, targetLocale: string): Promise<string> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  
  if (!key) {
    // Fallback or development warning
    console.warn('AZURE_TRANSLATOR_KEY not configured');
    return `[Translated to ${targetLocale}] ${text}`;
  }

  const endpoint = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0";
  // Extract ISO 639-1 code from BCP-47
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

    const json = await res.json();
    return json[0].translations[0].text;
  } catch (error) {
    console.error('Azure Translation failed:', error);
    return text; // Return original on failure
  }
}

/**
 * Handles translation of a single recognized phrase and saves it to Firestore.
 */
export async function POST(request: NextRequest) {
  try {
    const { callId, speakerId, sourceText } = await request.json();

    if (!callId || !speakerId || !sourceText) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Get translation configuration from Firestore
    const translationRef = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);
    const translationSnap = await translationRef.get();

    if (!translationSnap.exists) {
      return NextResponse.json({ error: 'Translation session not found' }, { status: 404 });
    }

    const translationData = translationSnap.data()!;
    const speakerData = translationData.participants[speakerId];

    if (!speakerData) {
      return NextResponse.json({ error: 'Speaker not found in session' }, { status: 404 });
    }

    const { sourceLocale, targetLocale } = speakerData;

    // 2. Perform translation
    const translatedText = await translateText(sourceText, targetLocale);

    // 3. Save the translation segment to Firestore subcollection
    const segmentsRef = translationRef.collection('segments');
    
    // Use an atomic increment for sequence tracking
    const sequence = (translationData.metrics?.totalSegments || 0) + 1;

    const segmentData = {
      callId,
      speakerUid: speakerId,
      speakerRole: speakerData.role,
      speakerDisplayName: speakerData.displayName,
      sourceLocale,
      targetLocale,
      originalText: sourceText,
      translatedText,
      isFinal: true,
      sequence,
      emittedAt: FieldValue.serverTimestamp(),
      finalizedAt: FieldValue.serverTimestamp(),
      provider: 'azure_translator',
      status: 'final',
    };

    const segmentRef = await segmentsRef.add(segmentData);

    // 4. Update the main translation document with new metrics
    await translationRef.update({
      'metrics.totalSegments': FieldValue.increment(1),
      'metrics.finalSegments': FieldValue.increment(1),
      lastSegmentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      segmentId: segmentRef.id,
      translatedText,
    });
  } catch (error) {
    console.error('Translation segment processing failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
