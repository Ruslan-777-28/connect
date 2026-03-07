import express, { type Request, type Response, type NextFunction } from 'express';

import { assertRequiredConfig, config } from './config';
import { isSessionRunning, runTranslationSession, stopTranslationSession } from './sessionRunner';

assertRequiredConfig();

const app = express();
app.use(express.json());

function requireInternalSecret(req: Request, res: Response, next: NextFunction) {
  const headerSecret = req.header('x-internal-translator-secret');

  if (!config.internalTranslatorSecret || headerSecret !== config.internalTranslatorSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'translator-worker',
  });
});

app.post('/internal/translation/start', requireInternalSecret, async (req, res) => {
  const callId = req.body?.callId as string | undefined;

  if (!callId) {
    return res.status(400).json({ error: 'Missing callId' });
  }

  try {
    if (isSessionRunning(callId)) {
      return res.json({
        ok: true,
        callId,
        alreadyRunning: true,
      });
    }

    await runTranslationSession(callId);

    return res.json({
      ok: true,
      callId,
      started: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    console.error('[worker/start] failed:', error);

    return res.status(500).json({
      error: 'Failed to start translation worker session',
      details: message,
    });
  }
});

app.post('/internal/translation/stop', requireInternalSecret, async (req, res) => {
  const callId = req.body?.callId as string | undefined;
  const reason = req.body?.reason as string | undefined;

  if (!callId) {
    return res.status(400).json({ error: 'Missing callId' });
  }

  try {
    await stopTranslationSession(callId, reason);

    return res.json({
      ok: true,
      callId,
      stopped: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    console.error('[worker/stop] failed:', error);

    return res.status(500).json({
      error: 'Failed to stop translation worker session',
      details: message,
    });
  }
});

app.listen(config.port, () => {
  console.log(`translator-worker listening on :${config.port}`);
});