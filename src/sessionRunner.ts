import {
  getTranslationDoc,
  markWorkerEnded,
  markWorkerError,
  markWorkerJoined,
  markWorkerJoining,
  markWorkerProcessing,
} from './firestore';

const activeSessions = new Map<
  string,
  {
    stop: () => Promise<void>;
  }
>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runTranslationSession(callId: string) {
  if (activeSessions.has(callId)) {
    throw new Error(`Translation session already running for callId=${callId}`);
  }

  let stopped = false;

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await markWorkerEnded(callId, 'manual_stop');
    activeSessions.delete(callId);
  };

  activeSessions.set(callId, { stop });

  try {
    await markWorkerJoining(callId);

    const { data } = await getTranslationDoc(callId);
    if (!data) {
      throw new Error(`Translation doc not found for callId=${callId}`);
    }

    const roomUrl = data.source?.dailyRoomUrl;
    if (!roomUrl) {
      throw new Error(`dailyRoomUrl missing in translation doc`);
    }

    console.log(`[SessionRunner] MOCK join for ${callId}: ${roomUrl}`);

    await sleep(300);
    await markWorkerJoined(callId);

    const participants = Object.values((data.participants ?? {}) as Record<string, any>);
    if (!participants.length) {
      throw new Error('Expected participants in translation doc');
    }

    await sleep(300);
    await markWorkerProcessing(callId);

    console.log(`[SessionRunner] Session ${callId} is now ACTIVE (mock transport mode).`);

    return;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown translation worker error';

    console.error(`[SessionRunner] Error for ${callId}:`, message);
    await markWorkerError(callId, 'WORKER_SESSION_FAILED', message);
    activeSessions.delete(callId);
    throw error;
  }
}

export async function stopTranslationSession(callId: string, reason?: string) {
  const session = activeSessions.get(callId);

  if (session) {
    console.log(`[SessionRunner] Stopping session ${callId}...`);
    await markWorkerEnded(callId, reason ?? 'manual_stop');
    activeSessions.delete(callId);
    return;
  }

  await markWorkerEnded(callId, reason ?? 'manual_stop');
}

export function isSessionRunning(callId: string) {
  return activeSessions.has(callId);
}
