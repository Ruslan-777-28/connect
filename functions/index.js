const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

exports.createDailyRoom = onCall(
  { region: "us-central1", secrets: ["DAILY_API_KEY"] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const apiKey = process.env.DAILY_API_KEY;
    if (!apiKey) {
      throw new HttpsError("internal", "Missing DAILY_API_KEY secret.");
    }

    const resp = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: `call-${Date.now()}`,
        privacy: "private", // ✅ MVP security
      }),
    });

    const raw = await resp.text();

    if (!resp.ok) {
      logger.error("Daily API error", { status: resp.status, raw });
      throw new HttpsError("internal", "Failed to create Daily room.");
    }

    const data = JSON.parse(raw);
    return { roomUrl: data.url, roomName: data.name };
  }
);
