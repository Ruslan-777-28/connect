const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { defineSecret } = require("firebase-functions/params");

const DAILY_API_KEY = defineSecret("DAILY_API_KEY");

exports.createDailyRoom = onCall(
  { region: "us-central1", secrets: [DAILY_API_KEY] },
  async (request) => {
    try {
      // 1) Auth guard
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "User must be authenticated to create a room."
        );
      }

      // 2) Secret from Gen2 env (bound via secretEnvironmentVariables)
      const apiKey = process.env.DAILY_API_KEY;
      logger.info("Daily API key exists:", !!apiKey);
      logger.info("Daily API key length:", apiKey?.length);
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

      logger.info("Daily response status:", resp.status);
      const rawText = await resp.text(); // Read as text first
      logger.info("Daily response raw:", rawText);

      if (!resp.ok) {
        // Log the error with the raw text, which might not be JSON
        logger.error("Daily API error", { status: resp.status, body: rawText });
        throw new HttpsError(
          "internal",
          `Daily API error (${resp.status}): ${rawText}`
        );
      }

      let data;
      try {
        data = JSON.parse(rawText); // Now parse the text
      } catch (e) {
        logger.error("Failed to parse Daily response JSON", {
          body: rawText,
          error: e,
        });
        throw new HttpsError("internal", "Invalid JSON response from Daily API.");
      }

      if (!data?.url) {
        logger.error("Daily response missing url", { data });
        throw new HttpsError(
          "internal",
          "Daily response did not include room url."
        );
      }

      return { roomUrl: data.url, name: data.name };
    } catch (err) {
      // normalize errors
      if (err instanceof HttpsError) throw err;
      logger.error("createDailyRoom failed", err);
      throw new HttpsError("internal", err?.message || "Unknown error");
    }
  }
);
