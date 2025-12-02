// routes/vipSubscription.js

const express = require('express');
const router = express.Router();
const { createVipRoom, findRoom, extendVipRoom } = require('../rooms/vipRooms');

const { google } = require('googleapis');

async function verifyPurchase(packageName, subscriptionId, token) {
  const auth = new google.auth.GoogleAuth({
    keyFile: "google-service-account.json",
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  const androidPublisher = google.androidpublisher({ version: "v3", auth });

  const res = await androidPublisher.purchases.subscriptions.get({
    packageName,
    subscriptionId,
    token,
  });

  return res.data;
}

router.post('/vip/purchase', async (req, res) => {
  try {
    const { userId, roomId, planType, purchaseToken, subscriptionId, packageName } = req.body;

    // Google doğrulaması
    const data = await verifyPurchase(packageName, subscriptionId, purchaseToken);

    if (!data || !data.expiryTimeMillis) {
      return res.json({ success: false, message: "Satın alma doğrulanamadı" });
    }

    let room;

    if (!roomId) {
      // yeni oda oluştur
      room = createVipRoom({ name: "VIP Oda", ownerId: userId, planType });
    } else {
      // mevcut odayı bul
      room = findRoom(roomId);
      extendVipRoom(room, planType);
    }

    return res.json({
      success: true,
      room,
      expiresAt: room.expiresAt,
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Hata oluştu" });
  }
});

module.exports = router;
