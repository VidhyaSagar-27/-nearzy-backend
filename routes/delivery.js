"use strict";
const router = require("express").Router();
const { protect, authorize } = require("../middleware/auth");
const { Order, User } = require("../models");

/* GET /api/delivery/orders — delivery partner sees available orders */
router.get("/orders", protect, authorize("delivery","admin"), async (req, res) => {
  try {
    const orders = await Order.find({
      orderStatus: { $in: ["ready","picked","on_the_way"] }
    }).populate("user","name phone").populate("shop","name address contact").sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, orders });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* GET /api/delivery/my-orders — delivery partner's assigned orders */
router.get("/my-orders", protect, authorize("delivery","admin"), async (req, res) => {
  try {
    const orders = await Order.find({ "deliveryPartner.userId": req.user._id })
      .populate("user","name phone").populate("shop","name address").sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* PUT /api/delivery/orders/:id/accept */
router.put("/orders/:id/accept", protect, authorize("delivery","admin"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    order.deliveryPartner = {
      userId: req.user._id,
      name: req.user.name,
      phone: req.user.phone
    };
    order.orderStatus = "picked";
    order.statusHistory.push({ status: "picked", note: "Picked up by delivery partner" });
    await order.save();
    if (global.io) global.io.to(`order_${order._id}`).emit("status_update", { status: "picked" });
    res.json({ success: true, order });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* PUT /api/delivery/orders/:id/location */
router.put("/orders/:id/location", protect, authorize("delivery","admin"), async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (global.io) global.io.to(`order_${req.params.id}`).emit("location_update", { lat, lng });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* PUT /api/delivery/orders/:id/delivered */
router.put("/orders/:id/delivered", protect, authorize("delivery","admin"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("user");
    if (!order) return res.status(404).json({ message: "Order not found" });
    order.orderStatus = "delivered";
    order.deliveredAt = new Date();
    order.statusHistory.push({ status: "delivered", note: "Delivered successfully" });
    await order.save();
    if (global.io) global.io.to(`order_${order._id}`).emit("status_update", { status: "delivered" });
    // Award loyalty points
    const pts = Math.floor((order.pricing?.total || 0) * 2);
    if (pts > 0) {
      await User.findByIdAndUpdate(order.user._id, { $inc: { "loyalty.points": pts, "loyalty.lifetime": pts } });
    }
    res.json({ success: true, order });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
