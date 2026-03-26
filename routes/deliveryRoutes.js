const express = require("express");
const router = express.Router();
const DeliveryBoy = require("../models/DeliveryBoy");
const Order = require("../models/Order");
const { auth } = require("../middleware/auth");

// GET MY DELIVERY PROFILE
router.get("/profile", auth, async (req, res) => {
  try {
    const profile = await DeliveryBoy.findOne({ user: req.user.id })
      .populate("user", "name phone email");
    res.json(profile);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// UPDATE AVAILABILITY
router.put("/availability", auth, async (req, res) => {
  try {
    const { isAvailable } = req.body;
    const boy = await DeliveryBoy.findOneAndUpdate(
      { user: req.user.id },
      { isAvailable },
      { new: true, upsert: true }
    );
    res.json({ message: `You are now ${isAvailable ? "Online" : "Offline"}`, boy });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// UPDATE LOCATION
router.put("/location", auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const boy = await DeliveryBoy.findOneAndUpdate(
      { user: req.user.id },
      { currentLocation: { lat, lng } },
      { new: true }
    );
    const io = req.app.get("io");
    if (io && boy?.activeOrder) {
      io.emit("deliveryLocation", { orderId: boy.activeOrder, lat, lng });
    }
    res.json({ message: "Location updated" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// STEP 1 — ACCEPT ORDER
router.put("/accept/:orderId", auth, async (req, res) => {
  try {
    const boy = await DeliveryBoy.findOne({ user: req.user.id });
    if (!boy) return res.status(404).json({ message: "Delivery profile not found" });
    if (!boy.isAvailable) return res.status(400).json({ message: "You are offline. Go online to accept orders." });
    if (boy.activeOrder) return res.status(400).json({ message: "You already have an active order." });

    await DeliveryBoy.findOneAndUpdate(
      { user: req.user.id },
      { isAvailable: false, activeOrder: req.params.orderId }
    );

    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      {
        deliveryPartner: req.user.id,
        orderStatus: "confirmed",
        $push: { tracking: { status: "confirmed", message: "Delivery partner assigned and heading to shop" } }
      },
      { new: true }
    ).populate("shop", "name address phone")
     .populate("customer", "name phone");

    if (!order) return res.status(404).json({ message: "Order not found" });

    const io = req.app.get("io");
    if (io) io.emit("orderUpdate", { orderId: order._id, status: "confirmed" });

    res.json({ message: "Order accepted! Head to the shop.", order });
  } catch (err) {
    console.error("Accept error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// STEP 2 — PICKED UP FROM SHOP
router.put("/pickup/:orderId", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.deliveryPartner?.toString() !== req.user.id)
      return res.status(403).json({ message: "This is not your order" });
    if (!["confirmed", "ready"].includes(order.orderStatus))
      return res.status(400).json({ message: `Cannot pick up — status is: ${order.orderStatus}` });

    order.orderStatus = "picked";
    order.tracking.push({ status: "picked", message: "Order picked up from shop" });
    await order.save();

    const io = req.app.get("io");
    if (io) io.emit("orderUpdate", { orderId: order._id, status: "picked" });

    res.json({ message: "Picked up! Head to customer.", order });
  } catch (err) {
    console.error("Pickup error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// STEP 3 — ON THE WAY
router.put("/on-the-way/:orderId", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.deliveryPartner?.toString() !== req.user.id)
      return res.status(403).json({ message: "This is not your order" });

    order.orderStatus = "on_the_way";
    order.tracking.push({ status: "on_the_way", message: "Delivery partner is on the way" });
    await order.save();

    const io = req.app.get("io");
    if (io) io.emit("orderUpdate", { orderId: order._id, status: "on_the_way" });

    res.json({ message: "Customer notified!", order });
  } catch (err) {
    console.error("On-the-way error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// STEP 4 — DELIVERED
router.put("/delivered/:orderId", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.deliveryPartner?.toString() !== req.user.id)
      return res.status(403).json({ message: "This is not your order" });
    if (order.orderStatus === "delivered")
      return res.status(400).json({ message: "Already delivered" });

    order.orderStatus = "delivered";
    order.deliveredAt = new Date();
    if (order.paymentMethod === "COD") order.paymentStatus = "paid";
    order.tracking.push({ status: "delivered", message: "Order delivered to customer" });
    await order.save();

    await DeliveryBoy.findOneAndUpdate(
      { user: req.user.id },
      { isAvailable: true, activeOrder: null, $inc: { totalDeliveries: 1, totalEarnings: 50 } }
    );

    const io = req.app.get("io");
    if (io) io.emit("orderUpdate", { orderId: order._id, status: "delivered" });

    res.json({ message: "Delivered! ₹50 credited.", order });
  } catch (err) {
    console.error("Delivered error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET EARNINGS
router.get("/earnings", auth, async (req, res) => {
  try {
    const boy = await DeliveryBoy.findOne({ user: req.user.id });
    const orders = await Order.find({ deliveryPartner: req.user.id, orderStatus: "delivered" })
      .populate("shop", "name")
      .sort({ deliveredAt: -1 })
      .limit(50);
    res.json({
      totalEarnings: boy?.totalEarnings || 0,
      totalDeliveries: boy?.totalDeliveries || 0,
      orders
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;