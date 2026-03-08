
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getStorage } from 'firebase-admin/storage';
import { TRANSLATION_COLLECTION } from '@/lib/translation/constants';

/**
 * Generates a transcript for a call session, uploads it to Storage,
 * and updates the call translation document.
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
    
    // 2. Fetch all segments
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
      const speakerName = seg.speakerDisplayName || participants[seg.speakerUid]?.displayName || 'Unknown';
      const role = seg.speakerRole === 'caller' ? 'Client' : 'Expert';
      
      transcriptLines.push(`[${speakerName} (${role})]`);
      transcriptLines.push(`Original (${seg.sourceLocale}): ${seg.originalText}`);
      transcriptLines.push(`Translation (${seg.targetLocale}): ${seg.translatedText}`);
      transcriptLines.push('---');
    });

    const transcriptContent = `Call Transcript - Session ${callId}\n` +
      `Generated at: ${new Date().toLocaleString()}\n` +
      `==========================================\n\n` +
      transcriptLines.join('\n');

    // 4. Upload to Firebase Storage
    const storage = getStorage();
    const bucket = storage.bucket();
    const filePath = `transcripts/${callId}/transcript.txt`;
    const file = bucket.file(filePath);

    await file.save(transcriptContent, {
      contentType: 'text/plain',
      metadata: {
        firebaseStorageDownloadTokens: callId, // Simplified for internal access
      },
    });

    // Make the file publicly accessible via a signed URL or predictable URL format if needed
    // For this MVP, we'll store the path and use a signed URL strategy in the UI
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '03-09-2491', // Long term expiration
    });

    // 5. Update Firestore
    await translationRef.update({
      transcriptUrl: url,
      transcriptGenerated: true,
      updatedAt: new Date(),
    });

    // Also update the main call document if it exists
    const callRef = adminDb.collection('calls').doc(callId);
    const callSnap = await callRef.get();
    if (callSnap.exists) {
      await callRef.update({
        transcriptUrl: url,
        transcriptGenerated: true,
      });
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
