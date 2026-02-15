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

exports.acceptCall = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

  const { callId } = request.data || {};
  if (!callId || typeof callId !== "string") {
    throw new HttpsError("invalid-argument", "callId is required.");
  }

  const ref = admin.firestore().collection("calls").doc(callId);

  const result = await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Call not found.");

    const call = snap.data();

    if (call.receiverUid !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Only receiver can accept.");
    }

    if (call.status !== "ringing") {
      throw new HttpsError("failed-precondition", `Cannot accept: status=${call.status}`);
    }

    const expiresAtMs = call.expiresAt?.toMillis?.() ?? 0;
    if (expiresAtMs && Date.now() > expiresAtMs) {
      tx.update(ref, {
        status: "expired",
        endedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw new HttpsError("deadline-exceeded", "Call expired.");
    }

    tx.update(ref, {
      status: "accepted",
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { roomUrl: call.roomUrl, roomName: call.roomName };
  });

  return result;
});


exports.endCall = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

  const { callId, reason } = request.data || {};
  if (!callId || typeof callId !== "string") {
    throw new HttpsError("invalid-argument", "callId is required.");
  }

  const ref = admin.firestore().collection("calls").doc(callId);

  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Call not found.");

    const call = snap.data();
    const isParticipant =
      call.callerUid === request.auth.uid || call.receiverUid === request.auth.uid;

    if (!isParticipant) {
      throw new HttpsError("permission-denied", "Only participants can end.");
    }

    if (call.status === "ended" || call.status === "expired" || call.status === "missed" || call.status === "declined") {
      return; // ідемпотентно
    }
    
    const finalStatus = (call.status === 'ringing' && reason === 'declined') ? 'declined' : 'ended';

    tx.update(ref, {
      status: finalStatus,
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
      endReason: typeof reason === "string" ? reason : null,
      endedBy: request.auth.uid,
    });
  });

  return { ok: true };
});
