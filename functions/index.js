const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { defineSecret } = require("firebase-functions/params");

const DAILY_API_KEY = defineSecret("DAILY_API_KEY");

exports.createDailyRoom = onCall(
  { region: "us-central1", secrets: [DAILY_API_KEY] },
  async (request) => {
    
    logger.info("ENV KEY:", process.env.DAILY_API_KEY);
    logger.info("KEY LENGTH:", process.env.DAILY_API_KEY?.length);

    if (!process.env.DAILY_API_KEY) {
      throw new HttpsError("failed-precondition", "DAILY_API_KEY is missing in function environment");
    }

    const resp = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: `call-${Date.now()}`,
      }),
    });

    logger.info("STATUS:", resp.status);

    const raw = await resp.text();
    logger.info("RAW RESPONSE:", raw);
    
    if (resp.ok) {
        const data = JSON.parse(raw);
        return { roomUrl: data.url };
    }

    throw new HttpsError("internal", `Daily API Error - Status: ${resp.status}, Body: ${raw}`);
  }
);
