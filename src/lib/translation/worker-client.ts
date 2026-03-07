interface WorkerStartPayload {
  callId: string;
  roomName?: string | null;
  dailyRoomUrl?: string | null;
  participants: Array<{
    uid: string;
    role: 'caller' | 'callee';
    displayName?: string | null;
    sourceLocale?: string;
    targetLocale?: string;
    captionsEnabled?: boolean;
    audioTranslationEnabled?: boolean;
  }>;
}

interface WorkerStopPayload {
  callId: string;
  reason?: string;
}

function getWorkerBaseUrl() {
  const url = process.env.INTERNAL_TRANSLATOR_URL;
  if (!url) {
    throw new Error('Missing INTERNAL_TRANSLATOR_URL');
  }
  return url.replace(/\/+$/, '');
}

function getWorkerSecret() {
  const secret = process.env.INTERNAL_TRANSLATOR_SECRET;
  if (!secret) {
    throw new Error('Missing INTERNAL_TRANSLATOR_SECRET');
  }
  return secret;
}

async function postToWorker<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${getWorkerBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-translator-secret': getWorkerSecret(),
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    details?: string;
  };

  if (!response.ok) {
    const message =
      data?.details || data?.error || `Worker request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export async function startWorkerTranslationSession(payload: WorkerStartPayload) {
  return postToWorker<{
    ok: boolean;
    callId: string;
    started?: boolean;
    alreadyRunning?: boolean;
  }>('/internal/translation/start', payload);
}

export async function stopWorkerTranslationSession(payload: WorkerStopPayload) {
  return postToWorker<{
    ok: boolean;
    callId: string;
    stopped?: boolean;
  }>('/internal/translation/stop', payload);
}
