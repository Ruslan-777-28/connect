import {
  getTranslationDoc,
  markWorkerEnded,
  markWorkerError,
  markWorkerJoined,
  markWorkerJoining,
  markWorkerProcessing,
} from './firestore';

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

      await markWorkerJoined(callId);

      // Placeholder for future Daily join + Azure init
      await sleep(500);

      await markWorkerProcessing(callId);

      // Placeholder for future live loop
      // For now, worker just marks the session active and exits.
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