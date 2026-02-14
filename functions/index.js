const { onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

const DAILY_API_KEY = defineSecret("DAILY_API_KEY");

exports.createDailyRoom = onCall(
  {
    region: "us-central1",
    secrets: [DAILY_API_KEY],
  },
  async (request) => {
    if (!request.auth) {
      throw new Error("User must be authenticated to create a room.");
    }

    const apiKey = DAILY_API_KEY.value();

    const response = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        properties: {
          exp: Math.round(Date.now() / 1000) + 60 * 60,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Daily API error:", errorText);
      throw new Error("Failed to create Daily room.");
    }

    const data = await response.json();

    return {
      roomUrl: data.url,
    };
  }
);
