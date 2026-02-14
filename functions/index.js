const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

exports.createDailyRoom = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to create a room."
    );
  }

  const DAILY_API_KEY = functions.config().daily.key;

  const response = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DAILY_API_KEY}`,
    },
    body: JSON.stringify({
      properties: {
        enable_chat: true,
        enable_screenshare: true,
        start_audio_off: false,
        start_video_off: false,
      },
    }),
  });

  const room = await response.json();

  if (!response.ok) {
    console.error("Daily.co API error:", room);
    throw new functions.https.HttpsError("internal", room?.error || "Failed to create Daily.co room");
  }

  return {
    roomUrl: room.url,
    roomName: room.name,
  };
});
