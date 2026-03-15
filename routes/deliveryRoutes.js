const express = require("express");
const router = express.Router();
const DeliveryBoy = require("../models/DeliveryBoy");
const Order = require("../models/Order");
const { auth } = require("../middleware/auth");

// GET MY DELIVERY PROFILE
router.get("/profile", auth, async (req, res) => {
  try {
    const profile = await DeliveryBoy.findOne({ user: req.user.id }).populate("user", "name phone email");
    res.json(profile);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// UPDATE AVAILABILITY
router.put("/availability", auth, async (req, res) => {
  try {
    const { isAvailable } = req.body;
    const boy = await DeliveryBoy.findOneAndUpdate({ user: req.user.id }, { isAvailable }, { new: true });
    res.json({ message: `You are now ${isAvailable ? "Online" : "Offline"}`, boy });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// UPDATE LOCATION
router.put("/location", auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const boy = await DeliveryBoy.findOneAndUpdate({ user: req.user.id }, { currentLocation: { lat, lng } }, { new: true });
    const io = req.app.get("io");
    if (io && boy.activeOrder) io.emit("deliveryLocation", { orderId: boy.activeOrder, lat, lng });
    res.json({ message: "Location updated" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ACCEPT ORDER
router.put("/accept/:orderId", auth, async (req, res) => {
  try {
    const boy = await DeliveryBoy.findOne({ user: req.user.id });
    if (!boy.isAvailable) return res.status(400).json({ message: "You are offline" });
    await DeliveryBoy.findOneAndUpdate({ user: req.user.id }, { isAvailable: false, activeOrder: req.params.orderId });
    const order = await Order.findByIdAndUpdate(req.params.orderId,
      { deliveryPartner: req.user.id, $push: { tracking: { status: "picked", message: "Delivery partner assigned" } } },
      { new: true });
    res.json({ message: "Order accepted", order });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// MARK DELIVERED
router.put("/delivered/:orderId", auth, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.orderId, {
      orderStatus: "delivered", deliveredAt: new Date(),
      $push: { tracking: { status: "delivered", message: "Order delivered successfully" } }
    }, { new: true });
    await DeliveryBoy.findOneAndUpdate({ user: req.user.id },
      { isAvailable: true, activeOrder: null, $inc: { totalDeliveries: 1, totalEarnings: 50 } });
    const io = req.app.get("io");
    if (io) io.emit("orderUpdate", { orderId: order._id, status: "delivered" });
    res.json({ message: "Marked as delivered", order });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET EARNINGS
router.get("/earnings", auth, async (req, res) => {
  try {
    const boy = await DeliveryBoy.findOne({ user: req.user.id });
    const orders = await Order.find({ deliveryPartner: req.user.id, orderStatus: "delivered" })
      .populate("shop", "name").sort({ deliveredAt: -1 });
    res.json({ totalEarnings: boy?.totalEarnings || 0, totalDeliveries: boy?.totalDeliveries || 0, orders });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;