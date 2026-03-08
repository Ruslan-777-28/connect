
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { ai } from '@/ai/genkit';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * Handles translation of a single recognized phrase and saves it to Firestore.
 * This endpoint is called by the browser when a final recognized phrase is available.
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

    // 2. Perform translation using Genkit (LLM)
    // We use a high-quality LLM for natural-sounding translations
    const translationResponse = await ai.generate({
      prompt: `Translate the following speech transcript from ${sourceLocale} to ${targetLocale}. 
      Maintain the original tone and context.
      
      Text: "${sourceText}"
      
      Provide ONLY the translated text, no extra explanations or quotation marks.`,
    });

    const translatedText = translationResponse.text;

    // 3. Save the translation segment to Firestore subcollection
    const segmentsRef = translationRef.collection('segments');
    
    // Use an atomic increment for sequence tracking if needed, 
    // or calculate based on existing metrics for MVP simplicity.
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
      provider: 'genkit_llm',
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
