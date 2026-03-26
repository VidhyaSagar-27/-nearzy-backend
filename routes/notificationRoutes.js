const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const { auth } = require("../middleware/auth");

// ─── GET MY NOTIFICATIONS ─────────────────────────────────────────────────────
// GET /api/notifications
router.get("/", auth, async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const unreadCount = await Notification.countDocuments({ user: req.user.id, isRead: false });
    res.json({ notifications, unreadCount, page: Number(page) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── MARK ONE AS READ ─────────────────────────────────────────────────────────
// PUT /api/notifications/:id/read
router.put("/:id/read", auth, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Marked as read", notification: notif });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── MARK ALL AS READ ─────────────────────────────────────────────────────────
// PUT /api/notifications/read-all
router.put("/read-all", auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE A NOTIFICATION ────────────────────────────────────────────────────
// DELETE /api/notifications/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    res.json({ message: "Notification deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE ALL NOTIFICATIONS ─────────────────────────────────────────────────
// DELETE /api/notifications/clear-all
router.delete("/clear-all", auth, async (req, res) => {
  try {
    await Notification.deleteMany({ user: req.user.id });
    res.json({ message: "All notifications cleared" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
