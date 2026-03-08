
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getStorage } from 'firebase-admin/storage';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * Generates a rich transcript for a call session (Original + Multi-Translations),
 * uploads it to Storage, and updates the call translation document.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> }
) {
  try {
    const { callId } = await context.params;

    if (!callId) {
      return NextResponse.json({ error: 'Missing callId' }, { status: 400 });
    }

    // 1. Fetch the translation document
    const translationRef = adminDb.collection(TRANSLATION_COLLECTION).doc(callId);
    const translationSnap = await translationRef.get();

    if (!translationSnap.exists) {
      return NextResponse.json({ error: 'Translation session not found' }, { status: 404 });
    }

    const translationData = translationSnap.data()!;
    
    // 2. Fetch all segments ordered by sequence
    const segmentsSnap = await translationRef
      .collection('segments')
      .orderBy('sequence', 'asc')
      .get();

    if (segmentsSnap.empty) {
      return NextResponse.json({ ok: true, message: 'No segments found to generate transcript' });
    }

    // 3. Format the transcript text
    const transcriptLines: string[] = [];
    const participants = translationData.participants || {};

    segmentsSnap.forEach((doc) => {
      const seg = doc.data();
      const speakerName = seg.speakerDisplayName || participants[seg.speakerUid]?.displayName || 'User';
      const time = seg.emittedAt?.toDate?.()?.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) || '--:--';
      
      transcriptLines.push(`[${time}] ${speakerName}`);
      transcriptLines.push(`Original: ${seg.originalText}`);
      
      // List all translations in the transcript
      if (seg.translations) {
        Object.entries(seg.translations).forEach(([locale, text]) => {
          transcriptLines.push(`Translation (${locale}): ${text}`);
        });
      }
      
      transcriptLines.push('------------------------------------------');
    });

    const transcriptContent = `CALL TRANSCRIPT - SESSION ${callId}\n` +
      `Generated at: ${new Date().toLocaleString('uk-UA')}\n` +
      `Mode: Multi-Target Translation Fan-out\n` +
      `==================================================\n\n` +
      transcriptLines.join('\n');

    // 4. Upload to Firebase Storage
    const storage = getStorage();
    const bucket = storage.bucket();
    const filePath = `transcripts/${callId}/transcript.txt`;
    const file = bucket.file(filePath);

    await file.save(transcriptContent, {
      contentType: 'text/plain',
      metadata: {
        firebaseStorageDownloadTokens: callId,
      },
    });

    // Make the file accessible
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '03-09-2491', // Long term
    });

    // 5. Update Firestore records
    const updateData = {
      transcriptUrl: url,
      transcriptGenerated: true,
      updatedAt: new Date(),
    };

    await translationRef.update(updateData);

    const callRef = adminDb.collection('calls').doc(callId);
    const callSnap = await callRef.get();
    if (callSnap.exists) {
      await callRef.update(updateData);
    }

    return NextResponse.json({
      ok: true,
      transcriptUrl: url,
    });
  } catch (error) {
    console.error('Transcript generation failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
