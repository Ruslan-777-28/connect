
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * Handles translation of a single recognized phrase and saves it to Firestore.
 */
export async function POST(request: NextRequest) {
  try {
    const { callId, speakerId, sourceText } = await request.json();

    if (!callId || !speakerId || !sourceText) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Get translation config
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
    // We can define a dynamic prompt for translation here
    const translationResponse = await ai.generate({
      prompt: `Translate the following text from ${sourceLocale} to ${targetLocale}. 
      Text: "${sourceText}"
      Provide only the translated text, no extra explanations.`,
    });

    const translatedText = translationResponse.text;

    // 3. Save segment to Firestore
    const segmentsRef = translationRef.collection('segments');
    
    // We increment a sequence counter in the parent doc or calculate based on count
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
      provider: 'azure_speech_llm',
      status: 'final',
    };

    const segmentRef = await segmentsRef.add(segmentData);

    // 4. Update metrics in parent doc
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
    console.error('Translation segment failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
