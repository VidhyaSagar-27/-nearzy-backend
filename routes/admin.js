"use strict";
const router = require("express").Router();
const { protect, authorize } = require("../middleware/auth");
const { User, Shop, Order, Product, Promo, Notification } = require("../models");

const admin = [protect, authorize("admin")];

/* GET /api/admin/stats */
router.get("/stats", ...admin, async (req, res) => {
  try {
    const [users, shops, orders, revenue] = await Promise.all([
      User.countDocuments({ role: "user" }),
      Shop.countDocuments({ isActive: true }),
      Order.countDocuments({ orderStatus: "delivered" }),
      Order.aggregate([{ $match: { orderStatus: "delivered" } }, { $group: { _id: null, total: { $sum: "$pricing.total" } } }])
    ]);
    res.json({ success: true, stats: { users, shops, orders, revenue: revenue[0]?.total || 0 } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* GET /api/admin/users */
router.get("/users", ...admin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = search ? { $or: [{ name: new RegExp(search,"i") }, { email: new RegExp(search,"i") }, { phone: new RegExp(search,"i") }] } : {};
    const [users, total] = await Promise.all([
      User.find(filter).select("-password -otp").sort({ createdAt: -1 }).skip((page-1)*limit).limit(parseInt(limit)),
      User.countDocuments(filter)
    ]);
    res.json({ success: true, users, total, pages: Math.ceil(total/limit) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* PUT /api/admin/shops/:id/verify */
router.put("/shops/:id/verify", ...admin, async (req, res) => {
  try {
    const shop = await Shop.findByIdAndUpdate(req.params.id, { isVerified: req.body.verified !== false, isActive: true }, { new: true });
    res.json({ success: true, shop });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* PUT /api/admin/orders/:id/status */
router.put("/orders/:id/status", ...admin, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    order.orderStatus = status;
    order.statusHistory.push({ status, note: "Updated by admin" });
    await order.save();
    if (global.io) global.io.to(`order_${order._id}`).emit("status_update", { status });
    res.json({ success: true, order });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* POST /api/admin/promos */
router.post("/promos", ...admin, async (req, res) => {
  try {
    const promo = await Promo.create(req.body);
    res.status(201).json({ success: true, promo });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* DELETE /api/admin/promos/:id */
router.delete("/promos/:id", ...admin, async (req, res) => {
  try {
    await Promo.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* POST /api/admin/broadcast */
router.post("/broadcast", ...admin, async (req, res) => {
  try {
    const { title, body, type = "system", userIds } = req.body;
    const filter = userIds ? { _id: { $in: userIds } } : {};
    const users = await User.find(filter).select("_id");
    const notifs = users.map(u => ({ user: u._id, title, body, type }));
    await Notification.insertMany(notifs);
    if (global.io) global.io.emit("broadcast", { title, body });
    res.json({ success: true, sent: notifs.length });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
