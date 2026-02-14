const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

exports.createDailyRoom = onCall({ region: "us-central1" }, async (request) => {
  try {
    // 1) Auth guard
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated to create a room.");
    }

    // 2) Secret from Gen2 env (bound via secretEnvironmentVariables)
    const apiKey = process.env.DAILY_API_KEY;
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "DAILY_API_KEY is missing. Bind secret DAILY_API_KEY to this function."
      );
    }

    // 3) Create Daily room
    const roomName = `call-${request.auth.uid}-${Date.now()}`;

    const resp = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Daily expects Bearer API key
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          enable_chat: true,
          start_audio_off: false,
          start_video_off: false,
          // optional:
          // exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
        },
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      logger.error("Daily API error", { status: resp.status, data });
      throw new HttpsError("internal", `Daily API error (${resp.status}): ${JSON.stringify(data)}`);
    }

    if (!data?.url) {
      logger.error("Daily response missing url", { data });
      throw new HttpsError("internal", "Daily response did not include room url.");
    }

    return { roomUrl: data.url, name: data.name };
  } catch (err) {
    // normalize errors
    if (err instanceof HttpsError) throw err;
    logger.error("createDailyRoom failed", err);
    throw new HttpsError("internal", err?.message || "Unknown error");
  }
});
