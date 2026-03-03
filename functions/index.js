
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

function ceilMinutesByRule(elapsedSeconds) {
  if (elapsedSeconds >= 1) return Math.ceil(elapsedSeconds / 60);
  return 0;
}

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }
  return request.auth.uid;
}

function assertNonEmptyString(v, field, maxLen) {
  if (typeof v !== "string") throw new HttpsError("invalid-argument", `${field} must be string`);
  const s = v.trim();
  if (!s) throw new HttpsError("invalid-argument", `${field} required`);
  if (maxLen && s.length > maxLen) throw new HttpsError("invalid-argument", `${field} too long`);
  return s;
}

function assertJpegFileMeta(meta) {
  if (!meta || typeof meta !== "object") throw new HttpsError("invalid-argument", "fileMeta required");
  const { mime, storagePath, size } = meta;
  if (mime !== "image/jpeg") throw new HttpsError("invalid-argument", "Only JPEG allowed");
  if (typeof storagePath !== "string" || !storagePath.startsWith("uploads/")) {
    throw new HttpsError("invalid-argument", "Invalid storagePath");
  }
  if (typeof size !== "number" || size <= 0) throw new HttpsError("invalid-argument", "Invalid file size");
  if (size > 10 * 1024 * 1024) throw new HttpsError("invalid-argument", "File too large");
  return { mime, storagePath, size, filename: meta.filename || null };
}

function requestTtl24h() {
  const now = tsNow();
  return admin.firestore.Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);
}

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

// --- COMM REQUEST: CREATE & HOLD ---
exports.createCommunicationRequest = onCall(
  { region: "us-central1" },
  async (request) => {
    const initiatorId = requireAuth(request);
    const offerId = assertNonEmptyString(request.data?.offerId, "offerId");
    const type = assertNonEmptyString(request.data?.type, "type");
    const questionText = assertNonEmptyString(request.data?.questionText, "questionText", 500);

    const db = admin.firestore();
    const offerSnap = await db.doc(`communicationOffers/${offerId}`).get();
    if (!offerSnap.exists) throw new HttpsError("not-found", "OFFER_NOT_FOUND");
    const offer = offerSnap.data();

    if (offer.type !== type) throw new HttpsError("failed-precondition", "OFFER_TYPE_MISMATCH");
    const authorId = offer.ownerId;

    const pricingSnapshot = {
      currency: COIN_CURRENCY,
      ratePerQuestion: offer.pricing?.ratePerQuestion || null,
      ratePerFile: offer.pricing?.ratePerFile || null,
    };

    const reservedCoins = type === "text"
      ? Number(pricingSnapshot.ratePerQuestion || 0)
      : Number((pricingSnapshot.ratePerQuestion || 0) + (pricingSnapshot.ratePerFile || 0));

    if (!Number.isFinite(reservedCoins) || reservedCoins <= 0) {
      throw new HttpsError("failed-precondition", "INVALID_PRICING");
    }

    const fileMeta = type === "file" ? assertJpegFileMeta(request.data?.fileMeta) : null;
    const requestRef = db.collection("communicationRequests").doc();
    const holdRef = db.collection("walletHolds").doc();
    const initiatorRef = db.doc(`users/${initiatorId}`);
    const expiresAt = requestTtl24h();

    await db.runTransaction(async (tx) => {
      const initiatorSnap = await tx.get(initiatorRef);
      if (!initiatorSnap.exists) throw new HttpsError("not-found", "INITIATOR_NOT_FOUND");
      const u = initiatorSnap.data();
      const balance = Number(u.balance || 0);
      const held = Number(u.held || 0);
      if (balance - held < reservedCoins) throw new HttpsError("failed-precondition", "INSUFFICIENT_AVAILABLE_BALANCE");

      tx.set(holdRef, {
        uid: initiatorId,
        amount: reservedCoins,
        currency: COIN_CURRENCY,
        status: "held",
        refType: "communicationRequest",
        refId: requestRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
      });

      tx.update(initiatorRef, { held: held + reservedCoins });

      tx.set(requestRef, {
        type,
        status: "pending",
        initiatorId,
        authorId,
        payerId: initiatorId,
        payeeId: authorId,
        offerId,
        pricingSnapshot,
        reservedCoins,
        holdId: holdRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessagePreview: questionText.slice(0, 120),
        ...(fileMeta ? { fileMeta } : {}),
      });

      tx.set(requestRef.collection("messages").doc(), {
        senderId: initiatorId,
        kind: "question",
        text: questionText,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (fileMeta) {
        tx.set(requestRef.collection("messages").doc(), {
          senderId: initiatorId,
          kind: "file",
          fileMeta,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    return { requestId: requestRef.id };
  }
);

// --- COMM REQUEST: POST ANSWER ---
exports.postAnswer = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const requestId = assertNonEmptyString(request.data?.requestId, "requestId");
    const answerText = assertNonEmptyString(request.data?.answerText, "answerText", 1000);

    const db = admin.firestore();
    const reqRef = db.doc(`communicationRequests/${requestId}`);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) throw new HttpsError("not-found", "REQUEST_NOT_FOUND");
      const req = snap.data();
      if (req.authorId !== uid) throw new HttpsError("permission-denied", "NOT_AUTHOR");
      if (req.status !== "pending") throw new HttpsError("failed-precondition", "NOT_PENDING");

      tx.set(reqRef.collection("messages").doc(), {
        senderId: uid,
        kind: "answer",
        text: answerText,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.update(reqRef, {
        status: "answered",
        answeredAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessagePreview: answerText.slice(0, 120),
      });
    });

    return { ok: true };
  }
);

// --- COMM REQUEST: CAPTURE PAYMENT ---
exports.confirmReceiptAndCapture = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const requestId = assertNonEmptyString(request.data?.requestId, "requestId");

    const db = admin.firestore();
    const reqRef = db.doc(`communicationRequests/${requestId}`);

    await db.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new HttpsError("not-found", "REQUEST_NOT_FOUND");
      const req = reqSnap.data();
      if (req.initiatorId !== uid) throw new HttpsError("permission-denied", "NOT_INITIATOR");
      if (req.status !== "answered") throw new HttpsError("failed-precondition", "NOT_ANSWERED");

      const holdRef = db.doc(`walletHolds/${req.holdId}`);
      const holdSnap = await tx.get(holdRef);
      if (!holdSnap.exists || holdSnap.data().status !== "held") throw new HttpsError("failed-precondition", "HOLD_INVALID");

      const payerRef = db.doc(`users/${req.payerId}`);
      const payeeRef = db.doc(`users/${req.payeeId}`);
      const [payerSnap, payeeSnap] = await Promise.all([tx.get(payerRef), tx.get(payeeRef)]);

      const amount = Number(req.reservedCoins || 0);
      const payerHeld = Number(payerSnap.data().held || 0);
      const payerBalance = Number(payerSnap.data().balance || 0);

      if (payerHeld < amount || payerBalance < amount) throw new HttpsError("failed-precondition", "INSUFFICIENT_FUNDS_AT_CAPTURE");

      applyCoinTransferTx(tx, {
        db, fromUid: req.payerId, toUid: req.payeeId,
        amount, callId: requestId, kind: "qa_capture",
        metadata: { offerId: req.offerId, type: req.type },
      });

      tx.update(payerRef, {
        held: payerHeld - amount,
        balance: payerBalance - amount,
        balanceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.update(payeeRef, {
        balance: Number(payeeSnap.data().balance || 0) + amount,
        balanceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.update(holdRef, { status: "captured", capturedAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.update(reqRef, { status: "completed", completedAt: admin.firestore.FieldValue.serverTimestamp(), lastMessageAt: admin.firestore.FieldValue.serverTimestamp() });
      
      tx.set(reqRef.collection("messages").doc(), {
        senderId: "system", kind: "system", text: `Payment captured: ${amount} COIN`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { ok: true };
  }
);

// --- COMM REQUEST: DECLINE ---
exports.declineCommunicationRequest = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const requestId = assertNonEmptyString(request.data?.requestId, "requestId");
    const reason = (request.data?.reason && String(request.data.reason).slice(0, 100)) || "declined";

    const db = admin.firestore();
    const reqRef = db.doc(`communicationRequests/${requestId}`);

    await db.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) return;
      const req = reqSnap.data();
      if (req.initiatorId !== uid && req.authorId !== uid) throw new HttpsError("permission-denied", "NOT_PARTICIPANT");
      if (req.status !== "pending") throw new HttpsError("failed-precondition", "NOT_PENDING");

      const holdRef = db.doc(`walletHolds/${req.holdId}`);
      const holdSnap = await tx.get(holdRef);
      if (holdSnap.exists && holdSnap.data().status === "held") {
        const payerRef = db.doc(`users/${req.payerId}`);
        const payerSnap = await tx.get(payerRef);
        if (payerSnap.exists) {
          const payerHeld = Number(payerSnap.data().held || 0);
          const amount = Number(req.reservedCoins || 0);
          tx.update(payerRef, { held: Math.max(0, payerHeld - amount) });
        }
        tx.update(holdRef, { status: "released", releasedAt: admin.firestore.FieldValue.serverTimestamp() });
      }

      tx.update(reqRef, {
        status: "declined", declinedAt: admin.firestore.FieldValue.serverTimestamp(),
        declineReason: reason, lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(reqRef.collection("messages").doc(), {
        senderId: "system", kind: "system", text: `Request declined: ${reason}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { ok: true };
  }
);

// --- CLEANUP & EXPIRATION ---
exports.expireCommunicationRequests = onSchedule(
  { region: "us-central1", schedule: "every 5 minutes" },
  async () => {
    const db = admin.firestore();
    const now = tsNow();
    const snap = await db.collection("communicationRequests")
      .where("status", "in", ["pending", "answered"])
      .where("expiresAt", "<=", now).limit(100).get();

    for (const doc of snap.docs) {
      const req = doc.data();
      await db.runTransaction(async (tx) => {
        const holdRef = db.doc(`walletHolds/${req.holdId}`);
        const holdSnap = await tx.get(holdRef);
        if (holdSnap.exists && holdSnap.data().status === "held") {
          const payerRef = db.doc(`users/${req.payerId}`);
          const payerSnap = await tx.get(payerRef);
          if (payerSnap.exists) {
            const held = Number(payerSnap.data().held || 0);
            const amount = Number(req.reservedCoins || 0);
            tx.update(payerRef, { held: Math.max(0, held - amount) });
          }
          tx.update(holdRef, { status: "released", releasedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        tx.update(doc.ref, { status: "expired", expiredAt: admin.firestore.FieldValue.serverTimestamp() });
      });
    }
  }
);

// --- VIDEO CALLS (Legacy/Daily) ---
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
    };

    const callRef = admin.firestore().collection("calls").doc();
    const nowTs = tsNow();
    const expiresAt = admin.firestore.Timestamp.fromMillis(nowTs.toMillis() + 45000);

    const callData = {
      status: "ringing", callerId, receiverId, callerName: request.auth.token.name || "Anonymous",
      createdAtTs: nowTs, expiresAt, offerId, pricingSnapshot, type: offer.type,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (offer.type === "video") {
      callData.roomUrl = `https://api.daily.co/v1/rooms/call-${callRef.id}`;
      callData.token = "demo-token-" + callRef.id;
    }

    await callRef.set(callData);
    return { callId: callRef.id, token: callData.token, roomUrl: callData.roomUrl };
  }
);

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

      const rate = call.pricingSnapshot.ratePerMinute;
      const callerRef = db.doc(`users/${call.callerId}`);
      const receiverRef = db.doc(`users/${call.receiverId}`);
      const [callerSnap, receiverSnap] = await Promise.all([tx.get(callerRef), tx.get(receiverRef)]);

      if (callerSnap.data().balance < rate) throw new HttpsError("failed-precondition", "INSUFFICIENT_BALANCE");

      applyCoinTransferTx(tx, { db, fromUid: call.callerId, toUid: call.receiverId, amount: rate, callId, kind: "call_prepay" });

      tx.update(callerRef, { balance: callerSnap.data().balance - rate });
      tx.update(receiverRef, { balance: receiverSnap.data().balance + rate });
      tx.update(callRef, { status: "accepted", acceptedAtTs: tsNow(), billedMinutes: 1, billedCoins: rate, acceptedByFn: true, acceptedFnRevision: process.env.K_REVISION || "dev" });
    });

    return { ok: true };
  }
);

exports.endCall = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const { callId, reason } = request.data;
    const db = admin.firestore();
    const callRef = db.doc(`calls/${callId}`);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(callRef);
      if (!snap.exists || snap.data().status === "ended") return;
      const call = snap.data();

      const updates = { status: "ended", endReason: reason || "ended_by_user", endedAtTs: tsNow(), endedByFn: true, endedFnRevision: process.env.K_REVISION || "dev" };

      if (call.status === "accepted" && call.type === "video" && call.acceptedAtTs) {
        const elapsedSec = Math.floor((Date.now() - call.acceptedAtTs.toMillis()) / 1000);
        const totalMin = ceilMinutesByRule(elapsedSec);
        const dueMin = totalMin - call.billedMinutes;
        if (dueMin > 0) {
          const rate = call.pricingSnapshot.ratePerMinute;
          applyCoinTransferTx(tx, { db, fromUid: call.callerId, toUid: call.receiverId, amount: dueMin * rate, callId, kind: "call_finalize" });
          updates.billedMinutes = call.billedMinutes + dueMin;
          updates.billedCoins = call.billedCoins + (dueMin * rate);
        }
      }
      tx.update(callRef, updates);
    });
    return { ok: true };
  }
);

exports.billingTickAcceptedCalls = onSchedule(
  { region: "us-central1", schedule: "every 1 minutes" },
  async () => {
    const db = admin.firestore();
    const snap = await db.collection("calls").where("status", "==", "accepted").limit(50).get();
    for (const doc of snap.docs) {
      const call = doc.data();
      if (call.type !== "video" || !call.acceptedAtTs) continue;
      const elapsedSec = Math.floor((Date.now() - call.acceptedAtTs.toMillis()) / 1000);
      const currentFullMin = Math.floor(elapsedSec / 60);
      const dueMin = currentFullMin - call.billedMinutes + 1;
      if (dueMin > 0) {
        await db.runTransaction(async (tx) => {
          const callerRef = db.doc(`users/${call.callerId}`);
          const cSnap = await tx.get(callerRef);
          const rate = call.pricingSnapshot.ratePerMinute;
          if (cSnap.data().balance < (dueMin * rate)) {
            tx.update(doc.ref, { status: "ended", endReason: "insufficient_balance" });
          } else {
            applyCoinTransferTx(tx, { db, fromUid: call.callerId, toUid: call.receiverId, amount: dueMin * rate, callId: doc.id, kind: "call_tick" });
            tx.update(callerRef, { balance: cSnap.data().balance - (dueMin * rate) });
            tx.update(doc.ref, { billedMinutes: call.billedMinutes + dueMin, billedCoins: call.billedCoins + (dueMin * rate) });
          }
        });
      }
    }
  }
);

exports.cleanupMissedCalls = onSchedule(
  { region: "us-central1", schedule: "every 5 minutes" },
  async () => {
    const db = admin.firestore();
    const snap = await db.collection("calls").where("status", "==", "ringing").where("expiresAt", "<=", tsNow()).limit(100).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { status: "ended", endReason: "expired" }));
    await batch.commit();
  }
);
