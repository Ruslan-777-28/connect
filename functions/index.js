const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

// ✅ Daily API key зберігаємо як Secret
const DAILY_API_KEY = defineSecret("DAILY_API_KEY");

exports.createDailyRoom = onCall(
  {
    region: "us-central1",
    secrets: [DAILY_API_KEY],
  },
  async (request) => {
    try {
      // ✅ auth guard
      if (!request.auth || !request.auth.uid) {
        throw new HttpsError("unauthenticated", "User must be authenticated to create a room.");
      }

      const apiKey = process.env.DAILY_API_KEY;
      if (!apiKey) {
        throw new HttpsError("failed-precondition", "DAILY_API_KEY is missing in function environment.");
      }

      // Можеш змінювати параметри кімнати як потрібно
      const body = {
        properties: {
          enable_chat: true,
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
          // exp — опціонально, наприклад 2 години
          // exp: Math.floor(Date.now() / 1000) + 60 * 60 * 2,
        },
      };

      console.log("HAS_KEY:", !!process.env.DAILY_API_KEY, "LEN:", (process.env.DAILY_API_KEY || "").length);

      const resp = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await resp.json();

      if (!resp.ok) {
        // Це найважливіше для дебагу: повернемо текст помилки Daily
        throw new HttpsError(
          "internal",
          `Daily API error (${resp.status}): ${JSON.stringify(data)}`
        );
      }

      if (!data || !data.url) {
        throw new HttpsError("internal", `Daily returned no url: ${JSON.stringify(data)}`);
      }

      return { roomUrl: data.url };
    } catch (err) {
      // Якщо це вже HttpsError — просто прокидаємо далі
      if (err instanceof HttpsError) throw err;

      // Інакше загортаємо в INTERNAL з текстом
      const message = err?.message ? String(err.message) : "Unknown error";
      throw new HttpsError("internal", message);
    }
  }
);
