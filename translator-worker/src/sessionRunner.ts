import {
  appendTestSegment,
  clearSegments,
  getTranslationDoc,
  markWorkerEnded,
  markWorkerError,
  markWorkerJoined,
  markWorkerJoining,
  markWorkerProcessing,
} from './firestore';
import { translateText } from './azure/translationEngine';

const activeSessions = new Map<string, Promise<void>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runTranslationSession(callId: string) {
  if (activeSessions.has(callId)) {
    throw new Error(`Translation session already running for callId=${callId}`);
  }

  const sessionPromise = (async () => {
    try {
      await markWorkerJoining(callId);

      const { data } = await getTranslationDoc(callId);
      if (!data) {
        throw new Error(`Translation doc not found for callId=${callId}`);
      }

      await clearSegments(callId);
      await markWorkerJoined(callId);

      const participants = Object.values((data.participants ?? {}) as Record<string, any>);
      const caller = participants.find((p) => p.role === 'caller') ?? participants[0];
      const callee = participants.find((p) => p.role === 'callee') ?? participants[1] ?? participants[0];

      if (!caller || !callee) {
        throw new Error('Expected at least one participant in translation doc');
      }

      await sleep(500);
      await markWorkerProcessing(callId);

      // --- AZURE TEST START ---
      try {
        console.log(`[AzureTest] Testing translation for ${callId}...`);
        const test = await translateText(
          "Hello, how are you",
          "en-US",
          "uk-UA"
        );
        console.log("Azure translation test successful:", test);
      } catch (azureErr: any) {
        console.error("Azure translation test FAILED:", azureErr.message);
      }
      // --- AZURE TEST END ---

      await appendTestSegment({
        callId,
        speakerUid: caller.uid,
        speakerRole: caller.role,
        speakerDisplayName: caller.displayName ?? 'Caller',
        sourceLocale: caller.sourceLocale ?? 'uk-UA',
        targetLocale: caller.targetLocale ?? 'en-US',
        originalText: 'Привіт',
        translatedText: 'Hello',
        isFinal: false,
        sequence: 1,
        latencyMs: 180,
      });

      await sleep(900);

      await appendTestSegment({
        callId,
        speakerUid: caller.uid,
        speakerRole: caller.role,
        speakerDisplayName: caller.displayName ?? 'Caller',
        sourceLocale: caller.sourceLocale ?? 'uk-UA',
        targetLocale: caller.targetLocale ?? 'en-US',
        originalText: 'Привіт, як справи?',
        translatedText: 'Hello, how are you?',
        isFinal: true,
        sequence: 2,
        latencyMs: 240,
      });

      await sleep(1200);

      await appendTestSegment({
        callId,
        speakerUid: callee.uid,
        speakerRole: callee.role,
        speakerDisplayName: callee.displayName ?? 'Callee',
        sourceLocale: callee.sourceLocale ?? 'en-US',
        targetLocale: callee.targetLocale ?? 'uk-UA',
        originalText: 'I am good, thank you.',
        translatedText: 'У мене все добре, дякую.',
        isFinal: true,
        sequence: 3,
        latencyMs: 210,
      });

      await sleep(1200);

      await appendTestSegment({
        callId,
        speakerUid: caller.uid,
        speakerRole: caller.role,
        speakerDisplayName: caller.displayName ?? 'Caller',
        sourceLocale: caller.sourceLocale ?? 'uk-UA',
        targetLocale: caller.targetLocale ?? 'en-US',
        originalText: 'Чудово, почнемо консультацію.',
        translatedText: 'Great, let us begin the consultation.',
        isFinal: true,
        sequence: 4,
        latencyMs: 260,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown translation worker error';

      await markWorkerError(callId, 'WORKER_SESSION_FAILED', message);
      throw error;
    } finally {
      activeSessions.delete(callId);
    }
  })();

  activeSessions.set(callId, sessionPromise);
  return sessionPromise;
}

export async function stopTranslationSession(callId: string, reason?: string) {
  await markWorkerEnded(callId, reason ?? 'manual_stop');
}

export function isSessionRunning(callId: string) {
  return activeSessions.has(callId);
}
