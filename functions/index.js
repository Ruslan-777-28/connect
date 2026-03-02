
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

const DAILY_API_KEY = defineSecret("DAILY_API_KEY");
const DAILY_WEBHOOK_HMAC = defineSecret("DAILY_WEBHOOK_HMAC");

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifyDailyWebhook(req, secretB64) {
  const sig = String(req.get("X-Webhook-Signature") || "");
  const ts = String(req.get("X-Webhook-Timestamp") || "");
  if (!sig || !ts) return false;

  const secret = Buffer.from(secretB64, "base64");
  const raw = req.rawBody; 

  const msg = Buffer.concat([Buffer.from(ts + "."), raw]);
  const digest = crypto.createHmac("sha256", secret).update(msg).digest("base64");

  return timingSafeEqualStr(digest, sig);
}

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
  return (typeof name === "string" && name.trim()) ? name.trim() : `user-${uid.slice(0, 6)}`;
}

async function createDailyRoomPrivate(apiKey) {
  const roomName = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const room = await dailyFetch("rooms", apiKey, {
    method: "POST",
    body: {
      name: roomName,
      privacy: "private",
      properties: {
        enable_prejoin_ui: true,
      },
    },
  });

  return { roomName: room.name, roomUrl: room.url };
}

async function createDailyMeetingToken(apiKey, { roomName, userName, userId, isOwner }) {
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

exports.devTopUp = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);

    const ALLOWED_UIDS = [
      "ARHzpFoUQTgRA7qXqOE7DYBKISG3",
    ];

    if (!ALLOWED_UIDS.includes(uid)) {
      throw new HttpsError("permission-denied", "You are not authorized to use the dev top-up.");
    }

    const amount = Number(request.data?.amount || 100);

    if (isNaN(amount) || amount <= 0) {
      throw new HttpsError("invalid-argument", "Amount must be a positive number");
    }

    const db = admin.firestore();
    const userRef = db.doc(`users/${uid}`);
    const ledgerRef = db.collection("walletLedger").doc();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError("not-found", "User not found");
      
      const currentBalance = snap.data().balance || 0;
      const newBalance = currentBalance + amount;

      tx.update(userRef, {
        balance: newBalance,
        currency: "COIN",
        balanceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(ledgerRef, {
        uid,
        type: "topup",
        amount,
        currency: "COIN",
        balanceAfter: newBalance,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "posted",
        metadata: {
          description: "Development top-up"
        }
      });
    });

    return { ok: true };
  }
);

exports.startCall = onCall(
  { region: "us-central1", secrets: [DAILY_API_KEY] },
  async (request) => {
    const callerId = requireAuth(request);
    const receiverId = assertString(request.data?.receiverId, "receiverId");
    const offerId = assertString(request.data?.offerId, "offerId");

    if (receiverId === callerId) {
      throw new HttpsError("invalid-argument", "Cannot call yourself");
    }

    // 1. Fetch and validate offer
    const offerSnap = await admin.firestore().doc(`communicationOffers/${offerId}`).get();
    if (!offerSnap.exists) {
        throw new HttpsError("not-found", "OFFER_NOT_FOUND");
    }
    const offer = offerSnap.data();

    if (offer.ownerId !== receiverId) {
        throw new HttpsError("permission-denied", "Offer does not belong to receiver");
    }
    
    // ✅ REQUIRED BALANCE (pre-call gate)
    const MIN_PREPAY_MINUTES = 1;

    function calcRequiredCoins(offerData) {
      const type = offerData.type;
      if (type === "video") {
        const rpm = Number(offerData.pricing?.ratePerMinute ?? 0);
        if (!Number.isFinite(rpm) || rpm <= 0) throw new HttpsError("failed-precondition", "Invalid ratePerMinute");
        return rpm * MIN_PREPAY_MINUTES;
      }
      if (type === "file") {
        const rpf = Number(offerData.pricing?.ratePerFile ?? 0);
        if (!Number.isFinite(rpf) || rpf <= 0) throw new HttpsError("failed-precondition", "Invalid ratePerFile");
        return rpf;
      }
      if (type === "text") {
        const rpq = Number(offerData.pricing?.ratePerQuestion ?? 0);
        if (!Number.isFinite(rpq) || rpq <= 0) throw new HttpsError("failed-precondition", "Invalid ratePerQuestion");
        return rpq;
      }
      throw new HttpsError("invalid-argument", "Unknown offer type");
    }

    const requiredCoins = calcRequiredCoins(offer);

    // Read caller profile + balance
    const callerSnap = await admin.firestore().doc(`users/${callerId}`).get();
    if (!callerSnap.exists) throw new HttpsError("not-found", "Caller profile not found");
    const callerBalance = Number(callerSnap.data().balance || 0);

    if (callerBalance < requiredCoins) {
      throw new HttpsError("failed-precondition", "INSUFFICIENT_BALANCE");
    }

    // 2. Receiver availability check
    const receiverSnap = await admin.firestore().doc(`users/${receiverId}`).get();
    if (!receiverSnap.exists) {
      throw new HttpsError("not-found", "Receiver user profile not found");
    }

    const availability = receiverSnap.get("availability");
    const isOnline = availability?.status === "online";
    let isExpired = false;
    if (availability?.until) {
        isExpired = availability.until.toMillis() < Date.now();
    }

    if (!isOnline || isExpired) {
        throw new HttpsError("failed-precondition", "User is currently unavailable for instant calls");
    }

    // 3. Create Room and Tokens
    const pricingSnapshot = {
      type: offer.type,
      categoryId: offer.categoryId || "",
      subcategoryId: offer.subcategoryId || "",
      currency: "COIN",
      ratePerMinute: offer.pricing.ratePerMinute || null,
      ratePerFile: offer.pricing.ratePerFile || null,
      ratePerQuestion: offer.pricing.ratePerQuestion || null,
      capturedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const apiKey = DAILY_API_KEY.value();
    const { roomName, roomUrl } = await createDailyRoomPrivate(apiKey);

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

    // 4. Finalize Call Document
    const callRef = admin.firestore().collection("calls").doc();
    const nowTs = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(nowTs.toMillis() + 45_000);

    await callRef.set({
      status: "ringing",
      callerId,
      receiverId,
      callerName,
      receiverActingAs: "pro",
      roomName,
      roomUrl,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtTs: nowTs, 
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      offerId,
      pricingSnapshot,
      requiredCoins,
      minPrepayMinutes: MIN_PREPAY_MINUTES
    });

    await admin.firestore().collection("dailyRooms").doc(roomName).set({
        callId: callRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      callId: callRef.id,
      roomName,
      roomUrl,
      token: callerToken,
      receiverId,
      offerId
    };
  }
);

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
 * Завершує дзвінок. Викликається клієнтом.
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

      // Якщо вже завершено, нічого не робимо
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

/**
 * Отримує події від Daily.co для оновлення стану учасників у кімнаті.
 */
exports.dailyWebhook = onRequest(
  { region: "us-central1", secrets: [DAILY_WEBHOOK_HMAC] },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const secretB64 = DAILY_WEBHOOK_HMAC.value();

    if (!verifyDailyWebhook(req, secretB64)) {
      return res.status(401).send("Invalid signature");
    }

    res.status(200).send("ok");

    try {
      const event = req.body;
      const eventId = event?.id || event?.uuid;
      const eventType = event?.type;

      const payload = event?.payload || {};
      const roomName = payload?.room?.name || payload?.room_name || payload?.room;
      const userId = payload?.participant?.user_id || payload?.user_id;

      if (!eventId || !eventType || !roomName) return;

      const db = admin.firestore();

      const mapRef = db.collection("dailyRooms").doc(roomName);
      const mapSnap = await mapRef.get();
      const callId = mapSnap.exists ? mapSnap.data()?.callId : null;
      if (!callId) return;

      const callRef = db.collection("calls").doc(callId);

      const evtRef = callRef.collection("webhookEvents").doc(String(eventId));
      await db.runTransaction(async (tx) => {
        const evtSnap = await tx.get(evtRef);
        if (evtSnap.exists) return; 

        const callSnap = await tx.get(callRef);
        if (!callSnap.exists) {
          tx.set(evtRef, { createdAt: admin.firestore.FieldValue.serverTimestamp(), ignored: "no-call" });
          return;
        }

        const call = callSnap.data();
        const status = call?.status;
        
        // Обробляємо події тільки для активних (accepted) дзвінків
        if (status !== "accepted") {
          tx.set(evtRef, { createdAt: admin.firestore.FieldValue.serverTimestamp(), ignored: "not-accepted", eventType });
          return;
        }

        const activeCount = Math.max(0, Number(call?.activeCount || 0));
        const participants = { ...(call?.participants || {}) };

        let nextActive = activeCount;

        if (eventType === "participant.joined") {
          nextActive = activeCount + 1;
          if (userId) participants[userId] = true;
        } else if (eventType === "participant.left") {
          nextActive = Math.max(0, activeCount - 1);
          if (userId) delete participants[userId];
        } else if (eventType === "meeting.ended") {
          nextActive = 0;
        } else {
          tx.set(evtRef, { createdAt: admin.firestore.FieldValue.serverTimestamp(), ignored: "unhandled", eventType });
          return;
        }

        const updates = {
          activeCount: nextActive,
          participants,
          lastPresenceAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Якщо всі учасники вийшли, завершуємо дзвінок
        if (nextActive === 0 && eventType !== "participant.joined") {
          updates.status = "ended";
          updates.endReason = "left";
          updates.endedBy = "system";
          updates.endedAt = admin.firestore.FieldValue.serverTimestamp();
        }

        tx.update(callRef, updates);

        tx.set(evtRef, {
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          eventType,
          roomName,
          userId: userId || null,
          nextActive,
        });
      });
    } catch (e) {
      console.error("dailyWebhook error:", e);
    }
  }
);
