const functions = require("firebase-functions");
const fetch = require("node-fetch");

exports.createDailyRoom = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    console.log("===== CREATE DAILY ROOM CALLED =====");
    console.log("CONTEXT AUTH:", context.auth);

    // 1️⃣ Перевірка авторизації
    if (!context.auth) {
      console.log("❌ No auth context received");
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to create a room."
      );
    }

    const uid = context.auth.uid;
    console.log("✅ Authenticated user:", uid);

    // 2️⃣ Отримання API ключа
    const dailyApiKey = functions.config().daily?.key;

    if (!dailyApiKey) {
      console.log("❌ DAILY API KEY NOT FOUND");
      throw new functions.https.HttpsError(
        "internal",
        "Daily API key is not configured."
      );
    }

    console.log("✅ Daily API key found");

    try {
      // 3️⃣ Створення кімнати в Daily
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

      console.log("Daily response:", roomData);

      if (!response.ok) {
        throw new functions.https.HttpsError(
          "internal",
          roomData?.error || "Failed to create Daily room."
        );
      }

      console.log("✅ Room created:", roomData.url);

      return {
        roomUrl: roomData.url,
      };
    } catch (error) {
      console.error("🔥 ERROR CREATING ROOM:", error);

      throw new functions.https.HttpsError(
        "internal",
        error.message || "Unexpected error creating Daily room."
      );
    }
  });
