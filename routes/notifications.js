"use strict";
const router = require("express").Router();
const { protect } = require("../middleware/auth");
const { Notification, User } = require("../models");

/* GET /api/notifications */
router.get("/", protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, notifications });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* PUT /api/notifications/read-all */
router.put("/read-all", protect, async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true, readAt: new Date() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* PUT /api/notifications/:id/read */
router.put("/:id/read", protect, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* DELETE /api/notifications/:id */
router.delete("/:id", protect, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* POST /api/notifications/subscribe (web push) */
router.post("/subscribe", protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { pushSubscription: req.body });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* Helper: createNotification (used internally by other routes) */
async function createNotification(userId, title, body, type = "system", data = {}) {
  try {
    const notif = await Notification.create({ user: userId, title, body, type, data });
    if (global.io) global.io.to(`user_${userId}`).emit("notification", notif);
    return notif;
  } catch (e) { console.error("Notif error:", e.message); }
}

module.exports = router;
module.exports.createNotification = createNotification;
