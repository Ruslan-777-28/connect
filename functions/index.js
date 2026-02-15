const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

exports.createDailyRoom = onCall(
  { region: "us-central1", secrets: ["DAILY_API_KEY"] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const { receiverUid, callerActingAs } = request.data || {};

    if (!receiverUid || typeof receiverUid !== "string") {
      throw new HttpsError("invalid-argument", "receiverUid is required.");
    }
    if (receiverUid === request.auth.uid) {
      throw new HttpsError("invalid-argument", "Cannot call yourself.");
    }

    const validRoles = new Set(["client", "pro"]);
    if (!validRoles.has(callerActingAs)) {
      throw new HttpsError("invalid-argument", "callerActingAs must be 'client' or 'pro'.");
    }

    const apiKey = process.env.DAILY_API_KEY;
    if (!apiKey) throw new HttpsError("internal", "Missing DAILY_API_KEY secret.");

    // 1) створюємо callId наперед
    const callRef = admin.firestore().collection("calls").doc();
    const callId = callRef.id;

    // 2) створюємо приватну Daily кімнату під цей callId
    const roomName = `call-${callId}`;

    const resp = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
      }),
    });

    const raw = await resp.text();
    if (!resp.ok) {
      logger.error("Daily API error", { status: resp.status, raw });
      throw new HttpsError("internal", "Failed to create Daily room.");
    }

    const room = JSON.parse(raw);
    const roomUrl = room.url;

    // 3) пишемо документ дзвінка
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 30 * 60 * 1000
    );

    await callRef.set({
      type: "video",
      status: "ringing",

      roomName,
      roomUrl,

      callerUid: request.auth.uid,
      receiverUid,

      callerActingAs,
      receiverActingAs: "pro",

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,

      acceptedAt: null,
      endedAt: null,
    });

    // 4) повертаємо все що потрібно фронту
    return { callId, roomUrl };
  }
);
