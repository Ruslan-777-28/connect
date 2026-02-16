const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

async function createDailyMeetingToken(apiKey, roomName, userId, displayName, isOwner = false) {
  const resp = await fetch("https://api.daily.co/v1/meeting-tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_id: userId,
        user_name: displayName,
        is_owner: !!isOwner,
        enable_prejoin_ui: false,
        exp: Math.floor(Date.now() / 1000) + 60 * 30,
      },
    }),
  });

  const raw = await resp.text();
  if (!resp.ok) {
    throw new Error(`Daily meeting-token error (${resp.status}): ${raw}`);
  }

  return JSON.parse(raw).token;
}

exports.createDailyRoom = onCall(
  { region: "us-central1", secrets: ["DAILY_API_KEY"] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Auth required.");
    }

    const { receiverUid } = request.data || {};
    if (!receiverUid) {
      throw new HttpsError("invalid-argument", "receiverUid required.");
    }

    const callerUid = request.auth.uid;
    if (receiverUid === callerUid) {
      throw new HttpsError("invalid-argument", "Cannot call yourself.");
    }

    const apiKey = process.env.DAILY_API_KEY;
    const db = admin.firestore();

    const callerSnap = await db.collection("users").doc(callerUid).get();
    const callerName = callerSnap.data()?.name || "User";

    const callRef = db.collection("calls").doc();
    const callId = callRef.id;

    const roomName = `call-${callId}`;

    const roomResp = await fetch("https://api.daily.co/v1/rooms", {
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

    const roomRaw = await roomResp.text();
    if (!roomResp.ok) {
      logger.error("Daily API error", { status: roomResp.status, raw: roomRaw });
      throw new HttpsError("internal", `Room create failed: ${roomRaw}`);
    }

    const room = JSON.parse(roomRaw);
    const roomUrl = room.url;

    const callerToken = await createDailyMeetingToken(
      apiKey,
      roomName,
      callerUid,
      callerName,
      true
    );

    const callerJoinUrl = `${roomUrl}?t=${callerToken}`;

    await callRef.set({
      type: "video",
      status: "ringing",
      roomName,
      roomUrl,
      callerUid,
      receiverUid,
      callerActingAs: "client",
      receiverActingAs: "pro",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      acceptedAt: null,
      endedAt: null,
    });

    return { callId, callerJoinUrl };
  }
);

exports.acceptCall = onCall(
  { region: "us-central1", secrets: ["DAILY_API_KEY"] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Auth required.");
    }

    const { callId } = request.data || {};
    if (!callId) {
      throw new HttpsError("invalid-argument", "callId required.");
    }

    const receiverUid = request.auth.uid;
    const db = admin.firestore();
    const apiKey = process.env.DAILY_API_KEY;

    const callRef = db.collection("calls").doc(callId);
    const snap = await callRef.get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "Call not found.");
    }

    const call = snap.data();

    if (call.receiverUid !== receiverUid) {
      throw new HttpsError("permission-denied", "Not your call.");
    }

    if (call.status !== "ringing") {
      throw new HttpsError("failed-precondition", "Call not ringing.");
    }

    const receiverSnap = await db.collection("users").doc(receiverUid).get();
    const receiverName = receiverSnap.data()?.name || "User";

    await callRef.update({
      status: "accepted",
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const receiverToken = await createDailyMeetingToken(
      apiKey,
      call.roomName,
      receiverUid,
      receiverName,
      false
    );

    const receiverJoinUrl = `${call.roomUrl}?t=${receiverToken}`;

    return { callId, receiverJoinUrl };
  }
);


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
