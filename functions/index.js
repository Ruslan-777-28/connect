
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

const DAILY_API_KEY = defineSecret("DAILY_API_KEY");
const DAILY_WEBHOOK_HMAC = defineSecret("DAILY_WEBHOOK_HMAC");

const BILLING_TICK_SCHEDULE = "every 1 minutes"; 
const MAX_ACCEPTED_SCAN = 200;
const COIN_CURRENCY = "COIN";

function tsNow() {
  return admin.firestore.Timestamp.now();
}

function ceilMinutesByRule(elapsedSeconds) {
  if (elapsedSeconds >= 1) return Math.ceil(elapsedSeconds / 60);
  return 0;
}

/**
 * Переказ COIN + записи в реєстр.
 */
function applyCoinTransferTx(tx, { db, fromUid, toUid, amount, callId, kind, metadata }) {
  const now = Date.now();
  const debitRef = db.collection("walletLedger").doc(`${callId}_${kind}_${now}_debit`);
  const creditRef = db.collection("walletLedger").doc(`${callId}_${kind}_${now}_credit`);

  tx.set(debitRef, {
    uid: fromUid,
    type: "call_payment",
    amount: -Math.abs(amount),
    currency: COIN_CURRENCY,
    callId,
    kind,
    status: "posted",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    metadata: metadata || {},
  });

  tx.set(creditRef, {
    uid: toUid,
    type: "payout",
    amount: Math.abs(amount),
    currency: COIN_CURRENCY,
    callId,
    kind,
    status: "posted",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    metadata: metadata || {},
  });
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

// --- Керування викликами та запитами ---

exports.startCall = onCall(
  { region: "us-central1", secrets: [DAILY_API_KEY] },
  async (request) => {
    const callerId = requireAuth(request);
    const receiverId = assertString(request.data?.receiverId, "receiverId");
    const offerId = assertString(request.data?.offerId, "offerId");

    const offerSnap = await admin.firestore().doc(`communicationOffers/${offerId}`).get();
    if (!offerSnap.exists) throw new HttpsError("not-found", "OFFER_NOT_FOUND");
    const offer = offerSnap.data();

    const pricingSnapshot = {
      type: offer.type,
      currency: "COIN",
      ratePerMinute: offer.pricing.ratePerMinute || null,
      ratePerFile: offer.pricing.ratePerFile || null,
      ratePerQuestion: offer.pricing.ratePerQuestion || null,
    };

    const callRef = admin.firestore().collection("calls").doc();
    const nowTs = tsNow();
    const expiresAt = admin.firestore.Timestamp.fromMillis(nowTs.toMillis() + (offer.type === "video" ? 45000 : 86400000)); // 24h for text/file

    const callData = {
      status: "ringing",
      callerId,
      receiverId,
      callerName: request.auth.token.name || "Anonymous",
      createdAtTs: nowTs,
      expiresAt,
      offerId,
      pricingSnapshot,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (offer.type === "video") {
      // Логіка для Daily.co залишається...
      const roomName = `call-${callRef.id}`;
      callData.roomName = roomName;
      callData.roomUrl = `https://api.daily.co/v1/rooms/${roomName}`; // Placeholder for MVP
    }

    await callRef.set(callData);
    return { callId: callRef.id };
  }
);

exports.acceptCall = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const callId = assertString(request.data?.callId, "callId");

    const db = admin.firestore();
    const callRef = db.doc(`calls/${callId}`);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(callRef);
      const call = snap.data();
      if (call.receiverId !== uid) throw new HttpsError("permission-denied", "Not yours");

      const pricing = call.pricingSnapshot;
      const amount = pricing.type === "video" ? pricing.ratePerMinute : (pricing.ratePerFile || pricing.ratePerQuestion);

      const callerRef = db.doc(`users/${call.callerId}`);
      const receiverRef = db.doc(`users/${call.receiverId}`);
      const [callerSnap, receiverSnap] = await Promise.all([tx.get(callerRef), tx.get(receiverRef)]);

      if (callerSnap.data().balance < amount) {
          tx.update(callRef, { status: "ended", endReason: "insufficient_balance" });
          throw new HttpsError("failed-precondition", "INSUFFICIENT_BALANCE");
      }

      applyCoinTransferTx(tx, {
        db, fromUid: call.callerId, toUid: call.receiverId,
        amount, callId, kind: "call_prepay",
      });

      tx.update(callerRef, { balance: callerSnap.data().balance - amount });
      tx.update(receiverRef, { balance: receiverSnap.data().balance + amount });

      tx.update(callRef, {
        status: "accepted",
        acceptedAtTs: tsNow(),
        billedMinutes: pricing.type === "video" ? 1 : 0,
        billedCoins: amount,
        acceptedByFn: true,
        acceptedFnRevision: process.env.K_REVISION || "dev",
      });
    });

    return { ok: true };
  }
);

exports.cleanupMissedCalls = onSchedule(
  { region: "us-central1", schedule: "every 5 minutes" },
  async () => {
    const db = admin.firestore();
    const now = tsNow();

    const snap = await db.collection("calls")
      .where("status", "==", "ringing")
      .where("expiresAt", "<=", now)
      .limit(100)
      .get();

    if (snap.empty) return;

    const batch = db.batch();
    snap.docs.forEach(d => {
      batch.update(d.ref, {
        status: "ended",
        endReason: "expired",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
  }
);
