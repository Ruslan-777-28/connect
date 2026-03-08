import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * Виконує переклад за допомогою Azure Translator API.
 */
async function translateText(text: string, targetLocale: string): Promise<string> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  
  if (!key) {
    console.warn('AZURE_TRANSLATOR_KEY не налаштовано, повертаємо оригінал.');
    return text;
  }

  const endpoint = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0";
  // Отримуємо ISO 639-1 код (наприклад, 'uk' з 'uk-UA')
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
 * Обробляє розпізнаний сегмент мовлення: перекладає та зберігає у Firestore.
 */
export async function POST(request: NextRequest) {
  try {
    const { callId, speakerId, text } = await request.json();

    if (!callId || !speakerId || !text) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Отримуємо конфігурацію сесії перекладу
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

    const { sourceLocale, targetLocale } = speakerData;

    // 2. Виконуємо переклад
    const translatedText = await translateText(text, targetLocale);

    // 3. Зберігаємо сегмент з підтримкою sequence для правильного сортування
    const segmentsRef = translationRef.collection('segments');
    const sequence = (translationData.metrics?.totalSegments || 0) + 1;

    const segmentData = {
      callId,
      speakerUid: speakerId,
      speakerRole: speakerData.role,
      speakerDisplayName: speakerData.displayName,
      sourceLocale,
      targetLocale,
      originalText: text,
      translatedText,
      isFinal: true,
      sequence,
      emittedAt: FieldValue.serverTimestamp(),
      finalizedAt: FieldValue.serverTimestamp(),
      provider: 'azure_speech',
      status: 'final',
    };

    await segmentsRef.add(segmentData);

    // 4. Оновлюємо метрики сесії
    await translationRef.update({
      'metrics.totalSegments': FieldValue.increment(1),
      'metrics.finalSegments': FieldValue.increment(1),
      lastSegmentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, translatedText });
  } catch (error) {
    console.error('Segment processing failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
