const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");

// Node 18+ має глобальний fetch, node-fetch не потрібен

exports.createDailyRoom = onCall(
  { region: "us-central1" },
  async (request) => {
    logger.info("===== CREATE DAILY ROOM CALLED =====");

    // ✅ request.auth у v2
    logger.info("AUTH:", request.auth);

    if (!request.auth) {
      logger.warn("❌ No auth context received");
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to create a room."
      );
    }

    const uid = request.auth.uid;
    logger.info("✅ Authenticated user:", uid);

    // ✅ Ключ беремо з Runtime Config (як у тебе зараз)
    // (functions.config() deprecated, але для тесту працює)
    const dailyApiKey = require("firebase-functions").config()?.daily?.key;

    if (!dailyApiKey) {
      logger.error("❌ DAILY API KEY NOT FOUND (functions.config().daily.key)");
      throw new HttpsError("internal", "Daily API key is not configured.");
    }

    logger.info("✅ Daily API key found");

    try {
      const response = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dailyApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            enable_chat: true,
            enable_screenshare: true,
          },
        }),
      });

      const roomData = await response.json();
      logger.info("Daily response:", roomData);

      if (!response.ok) {
        throw new HttpsError(
          "internal",
          roomData?.error || "Failed to create Daily room."
        );
      }

      logger.info("✅ Room created:", roomData.url);

      return { roomUrl: roomData.url };
    } catch (err) {
      logger.error("🔥 ERROR CREATING ROOM:", err);
      if (err instanceof HttpsError) {
        throw err;
      }
      throw new HttpsError(
        "internal",
        err.message || "Unexpected error creating Daily room."
      );
    }
  }
);
