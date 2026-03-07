import {
  getTranslationDoc,
  markWorkerEnded,
  markWorkerError,
  markWorkerJoined,
  markWorkerJoining,
  markWorkerProcessing,
} from './firestore';
import { translateText } from './azure/translationEngine';
import { DailyBot } from './daily/dailyBot';

const activeSessions = new Map<string, { promise: Promise<void>, bot: DailyBot }>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runTranslationSession(callId: string) {
  if (activeSessions.has(callId)) {
    throw new Error(`Translation session already running for callId=${callId}`);
  }

  const bot = new DailyBot(callId);

  const sessionPromise = (async () => {
    try {
      await markWorkerJoining(callId);

      const { data } = await getTranslationDoc(callId);
      if (!data) {
        throw new Error(`Translation doc not found for callId=${callId}`);
      }

      // 1. Join Daily Room (Commit 8.1 Transport Smoke Test)
      const roomUrl = data.source?.dailyRoomUrl;
      if (!roomUrl) {
        throw new Error(`dailyRoomUrl missing in translation doc`);
      }

      await bot.join(roomUrl);
      await markWorkerJoined(callId);

      const participants = Object.values((data.participants ?? {}) as Record<string, any>);
      const caller = participants.find((p) => p.role === 'caller') ?? participants[0];
      const callee = participants.find((p) => p.role === 'callee') ?? participants[1] ?? participants[0];

      if (!caller || !callee) {
        throw new Error('Expected participants in translation doc');
      }

      await sleep(500);
      await markWorkerProcessing(callId);

      console.log(`[SessionRunner] Session ${callId} is now ACTIVE. Listening for audio...`);

      // Keep the session alive until stopped externally
      // In Commit 8.1 we just wait. In 8.2+ we will process streams.
      await new Promise((resolve) => {
        // This is a placeholder. Real sessions stop via stopTranslationSession
      });

    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown translation worker error';

      console.error(`[SessionRunner] Error for ${callId}:`, message);
      await markWorkerError(callId, 'WORKER_SESSION_FAILED', message);
      await bot.leave();
      throw error;
    } finally {
      activeSessions.delete(callId);
    }
  })();

  activeSessions.set(callId, { promise: sessionPromise, bot });
  return sessionPromise;
}

export async function stopTranslationSession(callId: string, reason?: string) {
  const session = activeSessions.get(callId);
  if (session) {
    console.log(`[SessionRunner] Stopping session ${callId}...`);
    await session.bot.leave();
    await markWorkerEnded(callId, reason ?? 'manual_stop');
    // Note: the promise will be cleaned up in its own finally block
  }
}

export function isSessionRunning(callId: string) {
  return activeSessions.has(callId);
}
