
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const DAILY_API_KEY = defineSecret("DAILY_API_KEY");
const COIN_CURRENCY = "COIN";

function tsNow() {
  return admin.firestore.Timestamp.now();
}

/**
 * Округлення секунд до хвилин для білінгу.
 * 1 сек = 1 хв (згідно з бізнес-логікою проекту).
 */
function ceilMinutesByRule(elapsedSeconds) {
  if (elapsedSeconds >= 1) return Math.ceil(elapsedSeconds / 60);
  return 0;
}

/**
 * Переказ COIN та запис у walletLedger (Debit/Credit).
 */
function applyCoinTransferTx(tx, { db, fromUid, toUid, amount, callId, kind, metadata }) {
  const now = Date.now();
  const debitRef = db.collection("walletLedger").doc(`${callId}_${kind}_${now}_debit`);
  const creditRef = db.collection("walletLedger").doc(`${callId}_${kind}_${now}_credit`);

  const entryBase = {
    currency: COIN_CURRENCY,
    callId,
    kind,
    status: "posted",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    metadata: metadata || {},
  };

  tx.set(debitRef, { ...entryBase, uid: fromUid, type: "call_payment", amount: -Math.abs(amount) });
  tx.set(creditRef, { ...entryBase, uid: toUid, type: "payout", amount: Math.abs(amount) });
}

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }
  return request.auth.uid;
}

// --- СТАРТ ВИКЛИКУ ---
exports.startCall = onCall(
  { region: "us-central1", secrets: [DAILY_API_KEY] },
  async (request) => {
    const callerId = requireAuth(request);
    const receiverId = request.data?.receiverId;
    const offerId = request.data?.offerId;

    if (!receiverId || !offerId) throw new HttpsError("invalid-argument", "Missing data");

    const offerSnap = await admin.firestore().doc(`communicationOffers/${offerId}`).get();
    if (!offerSnap.exists) throw new HttpsError("not-found", "OFFER_NOT_FOUND");
    const offer = offerSnap.data();

    const pricingSnapshot = {
      type: offer.type,
      currency: COIN_CURRENCY,
      ratePerMinute: offer.pricing.ratePerMinute || null,
      ratePerFile: offer.pricing.ratePerFile || null,
      ratePerQuestion: offer.pricing.ratePerQuestion || null,
    };

    const callRef = admin.firestore().collection("calls").doc();
    const nowTs = tsNow();
    
    // Відео живе 45 сек (ringing), текст/файл - 24 години
    const ttlMs = offer.type === "video" ? 45000 : 86400000;
    const expiresAt = admin.firestore.Timestamp.fromMillis(nowTs.toMillis() + ttlMs);

    const callData = {
      status: "ringing",
      callerId,
      receiverId,
      callerName: request.auth.token.name || "Anonymous",
      createdAtTs: nowTs,
      expiresAt,
      offerId,
      pricingSnapshot,
      type: offer.type,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (offer.type === "video") {
      callData.roomUrl = `https://api.daily.co/v1/rooms/call-${callRef.id}`; // Placeholder
      callData.token = "demo-token-" + callRef.id; // Placeholder
    }

    await callRef.set(callData);
    return { 
      callId: callRef.id, 
      token: callData.token, 
      roomUrl: callData.roomUrl 
    };
  }
);

// --- ПРИЙНЯТТЯ ВИКЛИКУ (PREPAY) ---
exports.acceptCall = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const callId = request.data?.callId;
    const db = admin.firestore();
    const callRef = db.doc(`calls/${callId}`);

    logger.info("acceptCall HIT", { callId, uid, rev: process.env.K_REVISION });

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(callRef);
      if (!snap.exists) throw new HttpsError("not-found", "Call not found");
      const call = snap.data();
      if (call.receiverId !== uid) throw new HttpsError("permission-denied", "Not yours");
      if (call.status !== "ringing") throw new HttpsError("failed-precondition", "Not ringing");

      const pricing = call.pricingSnapshot;
      const rate = pricing.type === "video" ? pricing.ratePerMinute : (pricing.ratePerFile || pricing.ratePerQuestion);

      const callerRef = db.doc(`users/${call.callerId}`);
      const receiverRef = db.doc(`users/${call.receiverId}`);
      const [callerSnap, receiverSnap] = await Promise.all([tx.get(callerRef), tx.get(receiverRef)]);

      if (callerSnap.data().balance < rate) {
        tx.update(callRef, { status: "ended", endReason: "insufficient_balance" });
        throw new HttpsError("failed-precondition", "INSUFFICIENT_BALANCE");
      }

      // Списання Prepay
      applyCoinTransferTx(tx, {
        db, fromUid: call.callerId, toUid: call.receiverId,
        amount: rate, callId, kind: "call_prepay",
      });

      tx.update(callerRef, { balance: callerSnap.data().balance - rate });
      tx.update(receiverRef, { balance: receiverSnap.data().balance + rate });

      tx.update(callRef, {
        status: "accepted",
        acceptedAtTs: tsNow(),
        billedMinutes: pricing.type === "video" ? 1 : 0,
        billedCoins: rate,
        acceptedByFn: true,
        acceptedFnRevision: process.env.K_REVISION || "dev",
      });
    });

    return { ok: true };
  }
);

// --- ЗАВЕРШЕННЯ ВИКЛИКУ (FINALIZE) ---
exports.endCall = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const { callId, reason } = request.data;
    const db = admin.firestore();
    const callRef = db.doc(`calls/${callId}`);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(callRef);
      if (!snap.exists) return;
      const call = snap.data();
      if (call.status === "ended") return;

      const updates = {
        status: "ended",
        endReason: reason || "ended_by_user",
        endedAtTs: tsNow(),
        endedByFn: true,
        endedFnRevision: process.env.K_REVISION || "dev",
      };

      // Фіналізація білінгу для відео
      if (call.status === "accepted" && call.type === "video" && call.acceptedAtTs) {
        const now = Date.now();
        const start = call.acceptedAtTs.toMillis();
        const elapsedSec = Math.floor((now - start) / 1000);
        const totalMin = ceilMinutesByRule(elapsedSec);
        const dueMin = totalMin - call.billedMinutes;

        if (dueMin > 0) {
          const rate = call.pricingSnapshot.ratePerMinute;
          applyCoinTransferTx(tx, {
            db, fromUid: call.callerId, toUid: call.receiverId,
            amount: dueMin * rate, callId, kind: "call_finalize",
          });
          updates.billedMinutes = call.billedMinutes + dueMin;
          updates.billedCoins = call.billedCoins + (dueMin * rate);
        }
      }

      tx.update(callRef, updates);
    });

    return { ok: true };
  }
);

// --- ЩОХВИЛИННИЙ БІЛІНГ ---
exports.billingTickAcceptedCalls = onSchedule(
  { region: "us-central1", schedule: "every 1 minutes" },
  async () => {
    const db = admin.firestore();
    const snap = await db.collection("calls").where("status", "==", "accepted").limit(50).get();

    for (const doc of snap.docs) {
      const call = doc.data();
      if (call.type !== "video" || !call.acceptedAtTs) continue;

      const now = Date.now();
      const elapsedSec = Math.floor((now - call.acceptedAtTs.toMillis()) / 1000);
      const currentFullMin = Math.floor(elapsedSec / 60);
      const dueMin = currentFullMin - call.billedMinutes + 1; // +1 для prepay наступної хвилини

      if (dueMin > 0) {
        await db.runTransaction(async (tx) => {
          const cSnap = await tx.get(doc.ref);
          const callerRef = db.doc(`users/${call.callerId}`);
          const cRef = await tx.get(callerRef);
          const rate = call.pricingSnapshot.ratePerMinute;
          const cost = dueMin * rate;

          if (cRef.data().balance < cost) {
            tx.update(doc.ref, { status: "ended", endReason: "insufficient_balance" });
          } else {
            applyCoinTransferTx(tx, { db, fromUid: call.callerId, toUid: call.receiverId, amount: cost, callId: doc.id, kind: "call_tick" });
            tx.update(callerRef, { balance: cRef.data().balance - cost });
            tx.update(doc.ref, { billedMinutes: call.billedMinutes + dueMin, billedCoins: call.billedCoins + cost });
          }
        });
      }
    }
  }
);

// --- ОЧИЩЕННЯ ПРОПУЩЕНИХ ---
exports.cleanupMissedCalls = onSchedule(
  { region: "us-central1", schedule: "every 5 minutes" },
  async () => {
    const db = admin.firestore();
    const now = tsNow();
    const snap = await db.collection("calls")
      .where("status", "==", "ringing")
      .where("expiresAt", "<=", now)
      .limit(100).get();

    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { status: "ended", endReason: "expired" }));
    await batch.commit();
  }
);
