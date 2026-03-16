const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Shop = require("../models/Shop");
const Commission = require("../models/Commission");
const { auth, adminOnly } = require("../middleware/auth");

// PLACE ORDER
router.post("/", auth, async (req, res) => {
  try {
    const { shopId, items, subtotal, deliveryFee, tax, discount, totalAmount, paymentMethod, deliveryAddress, notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ message: "No items in order" });
    
    let shop = null;
    let commissionRate = 10;
    
    // Try to find shop - if shopId is empty, find shop from first product
    if (shopId) {
      shop = await Shop.findById(shopId);
    }
    
    // If still no shop found, create order without shop validation
    let finalShopId = shopId;
    if (!shop) {
      // Find any approved shop to associate with
      shop = await Shop.findOne({ isApproved: true });
      if (shop) finalShopId = shop._id;
    }
    
    if (shop) commissionRate = shop.commission || 10;
    const commissionAmount = Math.round((subtotal * commissionRate) / 100);
    const shopEarning = subtotal - commissionAmount;
    
    const orderData = {
      customer: req.user.id,
      items, subtotal,
      deliveryFee: deliveryFee || 0,
      tax: tax || 0,
      discount: discount || 0,
      commission: commissionAmount,
      totalAmount,
      paymentMethod: paymentMethod || "COD",
      paymentStatus: "pending",
      deliveryAddress,
      notes: notes || "",
      tracking: [{ status: "placed", message: "Order placed successfully" }]
    };
    
    if (finalShopId) orderData.shop = finalShopId;
    
    const order = new Order(orderData);
    const saved = await order.save();
    
    // Create commission record
    if (finalShopId) {
      await new Commission({
        order: saved._id, shop: finalShopId,
        orderAmount: subtotal, commissionRate,
        commissionAmount, shopEarning
      }).save();
      await Shop.findByIdAndUpdate(finalShopId, { $inc: { totalOrders: 1 } });
    }
    
    res.status(201).json({ message: "Order placed", order: saved });
  } catch (err) { 
    console.error("Order error:", err);
    res.status(500).json({ message: err.message }); 
  }
});

// GET MY ORDERS (customer)
router.get("/my-orders", auth, async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user.id })
      .populate("shop", "name logo category")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET SHOP ORDERS (seller)
router.get("/shop-orders", auth, async (req, res) => {
  try {
    const shop = await Shop.findOne({ owner: req.user.id });
    if (!shop) return res.status(404).json({ message: "No shop found" });
    const { status } = req.query;
    const query = { shop: shop._id };
    if (status) query.orderStatus = status;
    const orders = await Order.find(query)
      .populate("customer", "name phone")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET DELIVERY ORDERS
router.get("/delivery-orders", auth, async (req, res) => {
  try {
    if (req.user.role !== "delivery") return res.status(403).json({ message: "Delivery only" });
    const myOrders = await Order.find({ deliveryPartner: req.user.id })
      .populate("shop", "name address").populate("customer", "name phone")
      .sort({ createdAt: -1 });
    const available = await Order.find({ orderStatus: "ready", deliveryPartner: null })
      .populate("shop", "name address").populate("customer", "name phone")
      .sort({ createdAt: -1 });
    res.json({ myOrders, available });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET SINGLE ORDER
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("shop", "name logo address phone")
      .populate("customer", "name phone")
      .populate("deliveryPartner", "name phone");
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// UPDATE ORDER STATUS
router.put("/:id/status", auth, async (req, res) => {
  try {
    const { status, message } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Not found" });
    order.orderStatus = status;
    order.tracking.push({ status, message: message || `Order ${status}` });
    if (status === "delivered") {
      order.deliveredAt = new Date();
      order.paymentStatus = order.paymentMethod === "COD" ? "paid" : order.paymentStatus;
      await Commission.findOneAndUpdate({ order: order._id }, { status: "paid", paidAt: new Date() });
      await Shop.findByIdAndUpdate(order.shop, { $inc: { totalRevenue: order.subtotal } });
    }
    await order.save();
    // Emit socket event
    const io = req.app.get("io");
    if (io) io.emit("orderUpdate", { orderId: order._id, status, tracking: order.tracking });
    res.json({ message: "Status updated", order });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ASSIGN DELIVERY BOY
router.put("/:id/assign-delivery", auth, async (req, res) => {
  try {
    const { deliveryBoyId } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id,
      { deliveryPartner: deliveryBoyId, $push: { tracking: { status: "picked", message: "Delivery boy assigned" } } },
      { new: true });
    res.json({ message: "Delivery assigned", order });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// CANCEL ORDER
router.put("/:id/cancel", auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Not found" });
    if (!["placed", "confirmed"].includes(order.orderStatus))
      return res.status(400).json({ message: "Cannot cancel at this stage" });
    order.orderStatus = "cancelled";
    order.cancelReason = reason || "";
    order.tracking.push({ status: "cancelled", message: reason || "Cancelled by user" });
    await order.save();
    await Commission.findOneAndUpdate({ order: order._id }, { status: "cancelled" });
    res.json({ message: "Order cancelled", order });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADMIN - ALL ORDERS
router.get("/admin/all", auth, adminOnly, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("shop", "name").populate("customer", "name phone")
      .sort({ createdAt: -1 }).limit(100);
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;