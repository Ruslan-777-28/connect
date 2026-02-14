/* eslint-disable */

const admin = require("firebase-admin");
admin.initializeApp();

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Для тимчасової підтримки runtime config (functions:config:set daily.key=...)
// (це буде депрекейтнуто, але для PoC ок)
const functionsV1 = require("firebase-functions");

function getDailyApiKey() {
  return (
    process.env.DAILY_API_KEY ||
    (functionsV1.config()?.daily && functionsV1.config().daily.key) ||
    null
  );
}

exports.createDailyRoom = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      // 1) Auth guard
      if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      // 2) Key guard
      const dailyKey = getDailyApiKey();
      if (!dailyKey) {
        throw new HttpsError(
          "failed-precondition",
          "Daily API key is missing (DAILY_API_KEY env or functions config daily.key)."
        );
      }

      const uid = request.auth.uid;
      const roomName = `u_${uid}_${Date.now()}`;

      // 3) Call Daily REST API
      const res = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dailyKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: roomName,
          properties: {
            enable_chat: true,
            enable_knocking: true,
            start_video_off: false,
            start_audio_off: false,
            // кімната на 1 годину (PoC)
            exp: Math.floor(Date.now() / 1000) + 60 * 60,
          },
        }),
      });

      const bodyText = await res.text();

      if (!res.ok) {
        logger.error("Daily API returned non-OK", {
          status: res.status,
          body: bodyText,
        });
        throw new HttpsError(
          "internal",
          `Daily API error: ${res.status}`
        );
      }

      let data;
      try {
        data = JSON.parse(bodyText);
      } catch (e) {
        logger.error("Failed to parse Daily response JSON", { bodyText });
        throw new HttpsError("internal", "Invalid response from Daily API.");
      }

      const roomUrl = data?.url;
      if (!roomUrl) {
        logger.error("Daily response missing url", { data });
        throw new HttpsError("internal", "Daily response missing room url.");
      }

      // 4) (опційно) запис у Firestore для дебагу/історії
      await admin.firestore().collection("dailyRooms").add({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: uid,
        roomName: data.name || roomName,
        roomUrl,
        raw: data,
      });

      logger.info("Daily room created", { uid, roomUrl });

      // 5) Return
      return { roomUrl };
    } catch (err) {
      // Важливо: щоб INTERNAL став зрозумілим у логах
      logger.error("createDailyRoom failed", err);

      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", err?.message || "Unknown error");
    }
  }
);
