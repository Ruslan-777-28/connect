
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
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
  if (!mime.startsWith("image/")) throw new HttpsError("invalid-argument", "Only images allowed");
  if (typeof storagePath !== "string") throw new HttpsError("invalid-argument", "Invalid storagePath");
  if (typeof size !== "number" || size <= 0) throw new HttpsError("invalid-argument", "Invalid file size");
  if (size > 10 * 1024 * 1024) throw new HttpsError("invalid-argument", "File too large");
  return { mime, storagePath, size, filename: meta.filename || null };
}

function requestTtl24h() {
  const now = tsNow();
  return admin.firestore.Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);
}

function buildNotification({ uid, channel, kind, requestId, title, body }) {
  return {
    uid,
    channel,
    kind,
    requestId,
    title: title || "",
    body: body || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    readAt: null,
  };
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

// --- DAILY.CO UTILS ---
async function fetchDaily(path, method = 'GET', body = null) {
  const key = DAILY_API_KEY.value();
  if (!key || key === 'your-api-key') {
    throw new HttpsError("failed-precondition", "DAILY_API_KEY_NOT_CONFIGURED");
  }

  const res = await fetch(`https://api.daily.co/v1/${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : null
  });

  const data = await res.json();
  if (!res.ok) {
    logger.error("Daily API Error", data);
    throw new HttpsError("internal", data.info || data.error || "Daily API Error");
  }
  return data;
}

// --- FIRESTORE TRIGGERS ---

exports.onCommentCreated = onDocumentCreated(
  { document: "posts/{postId}/comments/{commentId}", region: "us-central1" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const comment = snapshot.data();
    const { postId } = event.params;

    const db = admin.firestore();
    
    try {
      const postSnap = await db.doc(`posts/${postId}`).get();
      if (!postSnap.exists) return;

      const post = postSnap.data();
      const authorId = post.authorId;

      if (comment.uid === authorId) return;

      const commenterSnap = await db.doc(`users/${comment.uid}`).get();
      const commenterName = commenterSnap.exists ? commenterSnap.data().name : "Користувач";

      const nRef = db.collection("notifications").doc();
      await nRef.set(buildNotification({
        uid: authorId,
        channel: "user",
        kind: "new_comment",
        requestId: postId,
        title: "Новий коментар",
        body: `${commenterName} прокоментував вашу публікацію "${post.title}".`
      }));
      
      logger.info(`Notification sent to ${authorId} for comment on post ${postId}`);
    } catch (error) {
      logger.error("Error in onCommentCreated trigger:", error);
    }
  }
);

// --- COMM REQUEST: CREATE & HOLD ---
exports.createCommunicationRequest = onCall(
  { region: "us-central1" },
  async (request) => {
    const initiatorId = requireAuth(request);
    const offerId = request.data?.offerId ? assertNonEmptyString(request.data.offerId, "offerId") : null;
    const productId = request.data?.productId ? assertNonEmptyString(request.data.productId, "productId") : null;
    const type = assertNonEmptyString(request.data?.type, "type");
    const questionText = assertNonEmptyString(request.data?.questionText, "questionText", 1000);

    const db = admin.firestore();
    let reservedCoins = 0;
    let authorId = "";
    let pricingSnapshot = { currency: COIN_CURRENCY };
    let scheduledStart = null;
    let scheduledEnd = null;

    if (productId) {
      const prodSnap = await db.doc(`products/${productId}`).get();
      if (!prodSnap.exists) throw new HttpsError("not-found", "PRODUCT_NOT_FOUND");
      const prod = prodSnap.data();
      reservedCoins = Number(prod.price || 0);
      authorId = prod.authorId;
      pricingSnapshot.productPrice = reservedCoins;
    } else if (offerId) {
      const offerSnap = await db.doc(`communicationOffers/${offerId}`).get();
      if (!offerSnap.exists) throw new HttpsError("not-found", "OFFER_NOT_FOUND");
      const offer = offerSnap.data();
      authorId = offer.ownerId;
      pricingSnapshot.ratePerQuestion = offer.pricing?.ratePerQuestion || null;
      pricingSnapshot.ratePerFile = offer.pricing?.ratePerFile || null;
      pricingSnapshot.ratePerSession = offer.pricing?.ratePerSession || null;
      
      if (offer.schedulingType === 'scheduled') {
        reservedCoins = Number(pricingSnapshot.ratePerSession || 0);
        scheduledStart = offer.scheduledStart;
        scheduledEnd = offer.scheduledEnd;
      } else {
        reservedCoins = type === "text"
          ? Number(pricingSnapshot.ratePerQuestion || 0)
          : Number((pricingSnapshot.ratePerQuestion || 0) + (pricingSnapshot.ratePerFile || 0));
      }
    }

    if (!Number.isFinite(reservedCoins) || reservedCoins < 0) {
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

      if (reservedCoins > 0) {
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
      }

      tx.set(requestRef, {
        type,
        status: "pending",
        initiatorId,
        authorId,
        payerId: initiatorId,
        payeeId: authorId,
        offerId,
        productId,
        pricingSnapshot,
        reservedCoins,
        holdId: reservedCoins > 0 ? holdRef.id : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessagePreview: questionText.slice(0, 120),
        scheduledStart,
        scheduledEnd,
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

      if (offerId) {
        tx.update(db.doc(`communicationOffers/${offerId}`), { status: 'booked' });
      }

      const nRef = db.collection("notifications").doc();
      tx.set(nRef, buildNotification({
        uid: authorId,
        channel: "user",
        kind: "request_created",
        requestId: requestRef.id,
        title: "Нове замовлення",
        body: productId ? "Придбано товар у вашому магазині." : "Надійшов запит на комунікацію."
      }));
    });

    return { requestId: requestRef.id };
  }
);

// --- COMM REQUEST: ACCEPT ---
exports.acceptCommunicationRequest = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const requestId = assertNonEmptyString(request.data?.requestId, "requestId");

    const db = admin.firestore();
    const reqRef = db.doc(`communicationRequests/${requestId}`);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) throw new HttpsError("not-found", "REQUEST_NOT_FOUND");
      const req = snap.data();

      if (req.authorId !== uid) throw new HttpsError("permission-denied", "NOT_AUTHOR");
      if (req.status !== "pending") throw new HttpsError("failed-precondition", "NOT_PENDING");

      const updates = {
        status: "accepted",
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (req.type === 'product' && req.productId) {
        const prodSnap = await tx.get(db.doc(`products/${req.productId}`));
        if (prodSnap.exists) {
          const prod = prodSnap.data();
          
          // Send delivery text
          tx.set(reqRef.collection("messages").doc(), {
            senderId: uid,
            kind: "answer",
            text: prod.deliveryText || "Дякуємо за покупку!",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Send delivery image if exists
          if (prod.deliveryImageUrl) {
            tx.set(reqRef.collection("messages").doc(), {
              senderId: uid,
              kind: "answer",
              text: "Delivery Content Image",
              fileMeta: { mime: 'image/jpeg', storagePath: prod.deliveryImageUrl, size: 0 },
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          updates.status = "answered";
          updates.answeredAt = admin.firestore.FieldValue.serverTimestamp();
          updates.lastMessageAt = admin.firestore.FieldValue.serverTimestamp();
          updates.lastMessagePreview = "Товар доставлено!";
        }
      }

      tx.update(reqRef, updates);

      const nRef = db.collection("notifications").doc();
      tx.set(nRef, buildNotification({
        uid: req.initiatorId,
        channel: "user",
        kind: "request_accepted",
        requestId,
        title: "Замовлення прийнято",
        body: req.type === 'product' ? "Товар готовий до отримання!" : "Ваш запит прийнято."
      }));
    });

    return { ok: true };
  }
);

// --- COMM REQUEST: POST ANSWER ---
exports.postAnswer = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const requestId = assertNonEmptyString(request.data?.requestId, "requestId");
    const answerText = assertNonEmptyString(request.data?.answerText, "answerText", 2000);

    const db = admin.firestore();
    const reqRef = db.doc(`communicationRequests/${requestId}`);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) throw new HttpsError("not-found", "REQUEST_NOT_FOUND");
      const req = snap.data();

      if (req.authorId !== uid) throw new HttpsError("permission-denied", "NOT_AUTHOR");
      if (req.status !== "accepted") throw new HttpsError("failed-precondition", "NOT_ACCEPTED");

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

      const nRef = db.collection("notifications").doc();
      tx.set(nRef, buildNotification({
        uid: req.initiatorId,
        channel: "user",
        kind: "request_answered",
        requestId,
        title: "Є відповідь",
        body: "Ви отримали відповідь на ваш запит."
      }));
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
      if (req.status !== "answered" && req.status !== "accepted") throw new HttpsError("failed-precondition", "NOT_READY_FOR_CAPTURE");

      const amount = Number(req.reservedCoins || 0);
      
      if (amount > 0) {
        const holdRef = db.doc(`walletHolds/${req.holdId}`);
        const holdSnap = await tx.get(holdRef);
        if (!holdSnap.exists || holdSnap.data().status !== "held") throw new HttpsError("failed-precondition", "HOLD_INVALID");

        const payerRef = db.doc(`users/${req.payerId}`);
        const payeeRef = db.doc(`users/${req.payeeId}`);
        const [payerSnap, payeeSnap] = await Promise.all([tx.get(payerRef), tx.get(payeeRef)]);

        const payerHeld = Number(payerSnap.data().held || 0);
        const payerBalance = Number(payerSnap.data().balance || 0);

        if (payerHeld < amount || payerBalance < amount) throw new HttpsError("failed-precondition", "INSUFFICIENT_FUNDS_AT_CAPTURE");

        applyCoinTransferTx(tx, {
          db, fromUid: req.payerId, toUid: req.payeeId,
          amount, callId: requestId, kind: "purchase_capture",
          metadata: { offerId: req.offerId, productId: req.productId, type: req.type },
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
      }

      tx.update(reqRef, { status: "completed", completedAt: admin.firestore.FieldValue.serverTimestamp(), lastMessageAt: admin.firestore.FieldValue.serverTimestamp() });
      
      tx.set(reqRef.collection("messages").doc(), {
        senderId: "system", kind: "system", text: amount > 0 ? `Payment captured: ${amount} COIN` : "Purchase completed",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const nRef = db.collection("notifications").doc();
      tx.set(nRef, buildNotification({
        uid: req.authorId,
        channel: "user",
        kind: "request_completed",
        requestId,
        title: "Оплата отримана",
        body: amount > 0 ? `Кошти (${amount} COIN) зараховано на баланс.` : "Замовлення завершено."
      }));
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
      if (req.status !== "pending" && req.status !== "accepted") throw new HttpsError("failed-precondition", "NOT_CANCELLABLE");

      if (req.reservedCoins > 0 && req.holdId) {
        const holdRef = db.doc(`walletHolds/${req.holdId}`);
        const holdSnap = await tx.get(holdRef);
        if (holdSnap.exists && holdSnap.data().status === "held") {
          const payerRef = db.doc(`users/${req.payerId}`);
          const payerSnap = await tx.get(payerRef);
          if (payerSnap.exists) {
            const payerHeld = Number(payerSnap.data().held || 0);
            tx.update(payerRef, { held: Math.max(0, payerHeld - req.reservedCoins) });
          }
          tx.update(holdRef, { status: "released", releasedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
      }

      tx.update(reqRef, {
        status: "declined", declinedAt: admin.firestore.FieldValue.serverTimestamp(),
        declineReason: reason, lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (req.offerId) {
        tx.update(db.doc(`communicationOffers/${req.offerId}`), { status: 'active' });
      }

      tx.set(reqRef.collection("messages").doc(), {
        senderId: "system", kind: "system", text: `Cancelled: ${reason}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const otherUid = (uid === req.initiatorId) ? req.authorId : req.initiatorId;
      const nRef = db.collection("notifications").doc();
      tx.set(nRef, buildNotification({
        uid: otherUid,
        channel: "user",
        kind: "request_declined",
        requestId,
        title: "Скасовано",
        body: "Замовлення було скасовано."
      }));
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
      .where("status", "in", ["pending", "accepted", "answered"])
      .where("expiresAt", "<=", now).limit(100).get();

    for (const docSnap of snap.docs) {
      const req = docSnap.data();
      await db.runTransaction(async (tx) => {
        if (req.reservedCoins > 0 && req.holdId) {
          const holdRef = db.doc(`walletHolds/${req.holdId}`);
          const holdSnap = await tx.get(holdRef);
          if (holdSnap.exists && holdSnap.data().status === "held") {
            const payerRef = db.doc(`users/${req.payerId}`);
            const payerSnap = await tx.get(payerRef);
            if (payerSnap.exists) {
              const held = Number(payerSnap.data().held || 0);
              tx.update(payerRef, { held: Math.max(0, held - req.reservedCoins) });
            }
            tx.update(holdRef, { status: "released", releasedAt: admin.firestore.FieldValue.serverTimestamp() });
          }
        }
        tx.update(docSnap.ref, { status: "expired", expiredAt: admin.firestore.FieldValue.serverTimestamp() });
        if (req.offerId) {
          tx.update(db.doc(`communicationOffers/${req.offerId}`), { status: 'active' });
        }
      });
    }
  }
);

// Cleanup expired scheduled offers that were never booked
exports.cleanupExpiredOffers = onSchedule(
  { region: "us-central1", schedule: "every 1 hours" },
  async () => {
    const db = admin.firestore();
    const now = tsNow();
    const snap = await db.collection("communicationOffers")
      .where("schedulingType", "==", "scheduled")
      .where("status", "==", "active")
      .where("scheduledEnd", "<", now)
      .limit(100).get();

    const batch = db.batch();
    snap.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    logger.info(`Cleaned up ${snap.docs.length} expired offers.`);
  }
);

// Send reminders for upcoming calls
exports.sendCallReminders = onSchedule(
  { region: "us-central1", schedule: "every 5 minutes" },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const reminderWindow = now + 10 * 60000; // Starting in next 10 mins
    
    const snap = await db.collection("communicationRequests")
      .where("status", "==", "accepted")
      .where("type", "==", "video")
      .where("scheduledStart", ">=", admin.firestore.Timestamp.fromMillis(now))
      .where("scheduledStart", "<=", admin.firestore.Timestamp.fromMillis(reminderWindow))
      .limit(50).get();

    for (const docSnap of snap.docs) {
      const req = docSnap.data();
      const requestId = docSnap.id;
      
      // Check if reminder already sent
      const alreadySent = await db.collection("notifications")
        .where("requestId", "==", requestId)
        .where("kind", "==", "call_reminder")
        .limit(1).get();

      if (alreadySent.empty) {
        const participants = [req.initiatorId, req.authorId];
        for (const uid of participants) {
          await db.collection("notifications").add(buildNotification({
            uid, channel: "user", kind: "call_reminder", requestId,
            title: "Нагадування про дзвінок",
            body: "Ваш запланований відеочат розпочнеться за декілька хвилин. Будьте готові!"
          }));
        }
      }
    }
  }
);

// --- VIDEO CALLS ---
exports.createDailyRoom = onCall(
  { region: "us-central1", secrets: [DAILY_API_KEY] },
  async (request) => {
    requireAuth(request);
    const room = await fetchDaily("rooms", "POST", {
      properties: {
        exp: Math.round(Date.now() / 1000) + 3600, // 1 hour expiry
        enable_chat: true,
      }
    });
    return { roomUrl: room.url, name: room.name };
  }
);

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

    // Availability switch logic
    if (offer.schedulingType === 'instant') {
      const receiverSnap = await admin.firestore().doc(`users/${receiverId}`).get();
      if (receiverSnap.exists) {
        const receiver = receiverSnap.data();
        const isOnline = receiver.availability?.status === 'online';
        const until = receiver.availability?.until;
        const expired = until && (until.toMillis() < Date.now());
        
        if (!isOnline || expired) {
          throw new HttpsError("failed-precondition", "RECEIVER_OFFLINE");
        }
      }
    } else {
      // For scheduled calls, ensure it's call time (e.g. +/- 5 min window)
      const now = Date.now();
      const start = offer.scheduledStart.toMillis() - 5 * 60000;
      const end = offer.scheduledEnd.toMillis();
      if (now < start || now > end) {
        throw new HttpsError("failed-precondition", "NOT_CALL_TIME");
      }
    }

    const pricingSnapshot = {
      type: offer.type,
      currency: COIN_CURRENCY,
      ratePerMinute: offer.pricing.ratePerMinute || null,
      ratePerSession: offer.pricing.ratePerSession || null,
    };

    // 1. Create real Daily room
    const room = await fetchDaily("rooms", "POST", {
      name: `call-${Date.now()}-${offerId.slice(0,5)}`,
      properties: {
        exp: Math.round(Date.now() / 1000) + 3600,
      }
    });

    // 2. Create token for caller
    const tokenData = await fetchDaily("meeting-tokens", "POST", {
      properties: {
        room_name: room.name,
        user_name: request.auth.token.name || "Caller",
        is_owner: true
      }
    });

    const callRef = admin.firestore().collection("calls").doc();
    const nowTs = tsNow();
    const expiresAt = admin.firestore.Timestamp.fromMillis(nowTs.toMillis() + 45000);

    const callData = {
      status: "ringing", callerId, receiverId, callerName: request.auth.token.name || "Anonymous",
      createdAtTs: nowTs, expiresAt, offerId, pricingSnapshot, type: offer.type,
      durationMinutes: offer.durationMinutes || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      roomUrl: room.url,
      roomName: room.name,
      token: tokenData.token
    };

    await callRef.set(callData);
    return { callId: callRef.id, token: callData.token, roomUrl: callData.roomUrl };
  }
);

exports.acceptCall = onCall(
  { region: "us-central1", secrets: [DAILY_API_KEY] },
  async (request) => {
    const uid = requireAuth(request);
    const callId = request.data?.callId;
    const db = admin.firestore();
    const callRef = db.doc(`calls/${callId}`);

    let roomUrl = "";
    let roomName = "";
    let token = "";

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(callRef);
      if (!snap.exists) throw new HttpsError("not-found", "Call not found");
      const call = snap.data();
      if (call.receiverId !== uid) throw new HttpsError("permission-denied", "Not yours");
      if (call.status !== "ringing") throw new HttpsError("failed-precondition", "Not ringing");

      roomUrl = call.roomUrl || "";
      roomName = call.roomName || "";

      const rate = call.pricingSnapshot.ratePerMinute || call.pricingSnapshot.ratePerSession;
      if (!rate) throw new HttpsError("failed-precondition", "NO_RATE_DEFINED");

      const callerRef = db.doc(`users/${call.callerId}`);
      const receiverRef = db.doc(`users/${call.receiverId}`);
      const [callerSnap, receiverSnap] = await Promise.all([tx.get(callerRef), tx.get(receiverRef)]);

      if (callerSnap.data().balance < rate) throw new HttpsError("failed-precondition", "INSUFFICIENT_BALANCE");

      applyCoinTransferTx(tx, { db, fromUid: call.callerId, toUid: call.receiverId, amount: rate, callId, kind: "call_prepay" });

      tx.update(callerRef, { balance: callerSnap.data().balance - rate });
      tx.update(receiverRef, { balance: receiverSnap.data().balance + rate });
      
      const billedMinutes = call.pricingSnapshot.ratePerSession ? (call.durationMinutes || 30) : 1;
      
      tx.update(callRef, { 
        status: "accepted", 
        acceptedAtTs: tsNow(), 
        billedMinutes: billedMinutes, 
        billedCoins: rate 
      });
    });

    // Generate token for receiver
    const tokenData = await fetchDaily("meeting-tokens", "POST", {
      properties: {
        room_name: roomName,
        user_name: request.auth.token.name || "Receiver",
        is_owner: false
      }
    });
    token = tokenData.token;

    return { ok: true, roomUrl, token };
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

      const updates = { status: "ended", endReason: reason || "ended_by_user", endedAtTs: tsNow() };

      if (call.status === "accepted" && call.type === "video" && call.acceptedAtTs && !call.pricingSnapshot.ratePerSession) {
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
    for (const docSnap of snap.docs) {
      const call = docSnap.data();
      if (call.type !== "video" || !call.acceptedAtTs || call.pricingSnapshot.ratePerSession) continue;
      const elapsedSec = Math.floor((Date.now() - call.acceptedAtTs.toMillis()) / 1000);
      const currentFullMin = Math.floor(elapsedSec / 60);
      const dueMin = currentFullMin - call.billedMinutes + 1;
      if (dueMin > 0) {
        await db.runTransaction(async (tx) => {
          const callerRef = db.doc(`users/${call.callerId}`);
          const cSnap = await tx.get(callerRef);
          const rate = call.pricingSnapshot.ratePerMinute;
          if (cSnap.data().balance < (dueMin * rate)) {
            tx.update(docSnap.ref, { status: "ended", endReason: "insufficient_balance" });
          } else {
            applyCoinTransferTx(tx, { db, fromUid: call.callerId, toUid: call.receiverId, amount: dueMin * rate, callId: docSnap.id, kind: "call_tick" });
            tx.update(callerRef, { balance: cSnap.data().balance - (dueMin * rate) });
            tx.update(docSnap.ref, { billedMinutes: call.billedMinutes + dueMin, billedCoins: call.billedCoins + (dueMin * rate) });
          }
        });
      }
    }
  }
);
