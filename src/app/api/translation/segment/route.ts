import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * Виконує переклад за допомогою Azure Translator API v3.0.
 */
async function translateText(text: string, targetLocale: string): Promise<string> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  
  if (!key) {
    console.warn('AZURE_TRANSLATOR_KEY missing, returning original text');
    return text;
  }

  const endpoint = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0";
  // Get ISO 639-1 code (e.g., 'uk' from 'uk-UA')
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
    console.error('Azure Translation failed:', error);
    return text; 
  }
}

/**
 * Обробляє розпізнаний сегмент мовлення: перекладає та зберігає у Firestore з серверною чергою.
 */
export async function POST(request: NextRequest) {
  try {
    const { callId, speakerId, text } = await request.json();

    if (!callId || !speakerId || !text) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Використовуємо транзакцію для гарантування послідовності (sequence)
    const result = await adminDb.runTransaction(async (transaction) => {
      const translationRef = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);
      const translationSnap = await transaction.get(translationRef);

      if (!translationSnap.exists) {
        throw new Error('Translation session not found');
      }

      const translationData = translationSnap.data()!;
      const speakerData = translationData.participants?.[speakerId];

      if (!speakerData) {
        throw new Error('Speaker configuration not found');
      }

      // 1. Виконуємо переклад
      const translatedText = await translateText(text, speakerData.targetLocale);

      // 2. Визначаємо наступний порядковий номер
      const currentSequence = translationData.metrics?.totalSegments || 0;
      const nextSequence = currentSequence + 1;

      // 3. Підготовлюємо документ сегмента
      const segmentsRef = translationRef.collection('segments');
      const segmentDocRef = segmentsRef.doc(); // Створюємо новий ID

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

      // 4. Виконуємо запис сегмента та оновлення метрик атомарно
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
    console.error('Segment processing failed:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
