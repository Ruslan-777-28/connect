const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const DAILY_API_KEY = defineSecret("DAILY_API_KEY");

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
  // Якщо з якоїсь причини name відсутній — даємо fallback, щоб токен не ламався.
  return (typeof name === "string" && name.trim()) ? name.trim() : `user-${uid.slice(0, 6)}`;
}

async function createDailyRoomPrivate(apiKey) {
  // room name — випадковий, щоб не колізилось
  const roomName = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const room = await dailyFetch("rooms", apiKey, {
    method: "POST",
    body: {
      name: roomName,
      privacy: "private",
      properties: {
        // prejoin UI лишаємо true (корисно для вибору камери/міка),
        // але пароль/ручні поля при meeting token більше не потрібні.
        enable_prejoin_ui: true,
      },
    },
  });

  return { roomName: room.name, roomUrl: room.url };
}

async function createDailyMeetingToken(apiKey, { roomName, userName, userId, isOwner }) {
  // meeting token дає автоматичний доступ до private room без паролів
  // exp: unix seconds (наприклад 2 години)
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

    // Перевіряємо що receiver існує в users/{uid}
    const receiverSnap = await admin.firestore().doc(`users/${receiverId}`).get();
    if (!receiverSnap.exists) {
      throw new HttpsError("not-found", "Receiver user profile not found");
    }

    const apiKey = DAILY_API_KEY.value();

    // 1) створюємо room
    const { roomName, roomUrl } = await createDailyRoomPrivate(apiKey);

    // 2) генеруємо токен для caller
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

    // 3) пишемо calls/{callId}
    const callRef = admin.firestore().collection("calls").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    await callRef.set({
      status: "ringing",               // ringing -> accepted -> ended
      callerId,
      receiverId,
      receiverActingAs: "pro",         // твій варіант A
      roomName,
      roomUrl,
      createdAt: now,
      updatedAt: now,
    });

    return {
      callId: callRef.id,
      roomName,
      roomUrl,
      token: callerToken,              // токен віддаємо тільки клієнту, НЕ в Firestore
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
 * returns: { ok: true }
 */
exports.endCall = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const callId = assertString(request.data?.callId, "callId");
    const reason = (typeof request.data?.reason === "string") ? request.data.reason.slice(0, 200) : null;

    const callRef = admin.firestore().doc(`calls/${callId}`);
    const snap = await callRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Call not found");

    const call = snap.data();
    const isParticipant = call.callerId === uid || call.receiverId === uid;
    if (!isParticipant) throw new HttpsError("permission-denied", "Not a call participant");

    await callRef.update({
      status: "ended",
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
      endedBy: uid,
      endReason: reason || "ended",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true };
  }
);
