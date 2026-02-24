const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

const DAILY_API_KEY = defineSecret("DAILY_API_KEY");
const DAILY_WEBHOOK_HMAC = defineSecret("DAILY_WEBHOOK_HMAC");

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }
  return request.auth.uid;
}

function assertString(v, field) {
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new HttpsError("invalid-argument", `${field} must be a non-empty string`);
  }
  return v.trim();
}

async function dailyFetch(path, apiKey, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.daily.co/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await res.text();
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch (_) {}

  if (!res.ok) {
    logger.error("Daily API error", { path, status: res.status, raw });
    throw new HttpsError(
      "internal",
      `Daily API error (${res.status})`,
      { status: res.status, raw }
    );
  }
  return json;
}

async function getUserName(uid) {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  const data = snap.exists ? snap.data() : null;
  const name = data?.name;
  // Fallback if name is missing for some reason, to prevent token from breaking.
  return (typeof name === "string" && name.trim()) ? name.trim() : `user-${uid.slice(0, 6)}`;
}

async function createDailyRoomPrivate(apiKey) {
  // random room name to avoid collisions
  const roomName = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const room = await dailyFetch("rooms", apiKey, {
    method: "POST",
    body: {
      name: roomName,
      privacy: "private",
      properties: {
        // Leave prejoin UI true (useful for camera/mic selection),
        // but password/manual fields are no longer needed with a meeting token.
        enable_prejoin_ui: true,
      },
    },
  });

  return { roomName: room.name, roomUrl: room.url };
}

async function createDailyMeetingToken(apiKey, { roomName, userName, userId, isOwner }) {
  // meeting token gives automatic access to a private room without passwords
  // exp: unix seconds (e.g., 2 hours)
  const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60;

  const token = await dailyFetch("meeting-tokens", apiKey, {
    method: "POST",
    body: {
      properties: {
        room_name: roomName,
        user_name: userName,
        user_id: userId,
        is_owner: !!isOwner,
        exp,
      },
    },
  });

  return token?.token;
}

/**
 * startCall
 * data: { receiverId: string }
 * returns: { callId, roomUrl, roomName, token, receiverId }
 */
exports.startCall = onCall(
  { region: "us-central1", secrets: [DAILY_API_KEY] },
  async (request) => {
    const callerId = requireAuth(request);
    const receiverId = assertString(request.data?.receiverId, "receiverId");

    if (receiverId === callerId) {
      throw new HttpsError("invalid-argument", "Cannot call yourself");
    }

    // Check that receiver exists in users/{uid}
    const receiverSnap = await admin.firestore().doc(`users/${receiverId}`).get();
    if (!receiverSnap.exists) {
      throw new HttpsError("not-found", "Receiver user profile not found");
    }

    const apiKey = DAILY_API_KEY.value();

    // 1) create room
    const { roomName, roomUrl } = await createDailyRoomPrivate(apiKey);

    // 2) generate token for caller
    const callerName = await getUserName(callerId);
    const callerToken = await createDailyMeetingToken(apiKey, {
      roomName,
      userName: callerName,
      userId: callerId,
      isOwner: true,
    });

    if (!callerToken) {
      throw new HttpsError("internal", "Failed to create Daily meeting token for caller");
    }

    // 3) write to calls/{callId}
    const callRef = admin.firestore().collection("calls").doc();
    const nowTs = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(nowTs.toMillis() + 45_000);


    await callRef.set({
      status: "ringing",               // ringing -> accepted -> ended
      callerId,
      receiverId,
      callerName,
      receiverActingAs: "pro",
      roomName,
      roomUrl,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // NEW: server lifecycle deadline
      expiresAt,
    });

    await admin.firestore().collection("dailyRooms").doc(roomName).set({
        callId: callRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      callId: callRef.id,
      roomName,
      roomUrl,
      token: callerToken,              // token is returned only to the client, NOT in Firestore
      receiverId,
    };
  }
);

/**
 * acceptCall
 * data: { callId: string }
 * returns: { roomUrl, roomName, token }
 */
exports.acceptCall = onCall(
  { region: "us-central1", secrets: [DAILY_API_KEY] },
  async (request) => {
    const uid = requireAuth(request);
    const callId = assertString(request.data?.callId, "callId");

    const callRef = admin.firestore().doc(`calls/${callId}`);
    const snap = await callRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Call not found");

    const call = snap.data();
    if (call.receiverId !== uid) {
      throw new HttpsError("permission-denied", "Only receiver can accept this call");
    }
    if (call.status !== "ringing") {
      throw new HttpsError("failed-precondition", `Call is not in ringing state (status=${call.status})`);
    }

    const apiKey = DAILY_API_KEY.value();

    const receiverName = await getUserName(uid);
    const receiverToken = await createDailyMeetingToken(apiKey, {
      roomName: call.roomName,
      userName: receiverName,
      userId: uid,
      isOwner: false,
    });

    if (!receiverToken) {
      throw new HttpsError("internal", "Failed to create Daily meeting token for receiver");
    }

    await callRef.update({
      status: "accepted",
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await callRef.update({
        activeCount: 0,
        participants: {},
        lastPresenceAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      roomName: call.roomName,
      roomUrl: call.roomUrl,
      token: receiverToken,
    };
  }
);

/**
 * endCall
 * data: { callId: string, reason?: string }
 * returns: { ok: true, alreadyEnded?: true }
 */
exports.endCall = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const callId = assertString(request.data?.callId, "callId");
    const reason =
      typeof request.data?.reason === "string"
        ? request.data.reason.slice(0, 200)
        : null;

    const callRef = admin.firestore().doc(`calls/${callId}`);

    const result = await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(callRef);
      if (!snap.exists) {
        throw new HttpsError("not-found", "Call not found");
      }

      const call = snap.data();
      const isParticipant = call.callerId === uid || call.receiverId === uid;
      if (!isParticipant) {
        throw new HttpsError("permission-denied", "Not a call participant");
      }

      // ✅ Ідемпотентність: якщо вже ended — просто повертаємо ok
      if (call.status === "ended") {
        return { ok: true, alreadyEnded: true };
      }

      tx.update(callRef, {
        status: "ended",
        endedAt: admin.firestore.FieldValue.serverTimestamp(),
        endedBy: uid,
        endReason: reason || "ended",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { ok: true };
    });

    return result;
  }
);

/**
 * cleanupMissedCalls (scheduled)
 * Every minute: end calls stuck in "ringing" past expiresAt.
 */
exports.cleanupMissedCalls = onSchedule(
  { region: "us-central1", schedule: "every 1 minutes" },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    const snap = await db
      .collection("calls")
      .where("status", "==", "ringing")
      .where("expiresAt", "<=", now)
      .limit(400)
      .get();

    if (snap.empty) {
      logger.log("No missed calls to clean up.");
      return;
    }

    logger.log(`Cleaning up ${snap.size} missed calls.`);
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.update(doc.ref, {
        status: "ended",
        endReason: "missed",
        endedBy: "system",
        endedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  }
);

exports.dailyWebhook = onRequest({ region: "us-central1" }, (req, res) => {
  return res.status(200).send("ok");
});
