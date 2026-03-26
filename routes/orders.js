"use strict";
const router = require("express").Router();
const { Order, Shop, Product, WalletTx, Notification, User } = require("../models");
const { protect } = require("../middleware/auth");

/* ══════════════════════════════════════════════════════════
   ORDERS ROUTER
══════════════════════════════════════════════════════════ */

/* ─── PLACE ORDER ────────────────────────────────────────── */
router.post("/", protect, async (req, res) => {
  try {
    const { shopId, items, payment, deliveryAddress, promoCode, walletAmount, scheduledFor } = req.body;
    if (!items?.length) return res.status(400).json({ error: "No items in order" });

    const shop = await Shop.findById(shopId);
    if (!shop || !shop.isActive) return res.status(400).json({ error: "Shop unavailable" });

    // Calculate pricing
    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (product) {
        subtotal += (product.price * item.qty);
        orderItems.push({ product: product._id, name: product.name, price: product.price, qty: item.qty, image: product.images?.[0] || "" });
      } else if (item.isFlashDeal) {
        subtotal += item.price * item.qty;
        orderItems.push({ name: item.name, price: item.price, qty: item.qty, image: "" });
      }
    }

    const deliveryCharge = subtotal >= (shop.delivery.freeAbove || 299) ? 0 : (shop.delivery.charge || 40);
    const gst = Math.round(subtotal * 0.05);
    const walletUsed = Math.min(walletAmount || 0, req.user.wallet.balance || 0);
    const total = Math.max(0, subtotal + deliveryCharge + gst - walletUsed);

    const order = await Order.create({
      user: req.user._id,
      shop: shopId,
      items: orderItems,
      pricing: { subtotal, deliveryCharge, gst, walletUsed, total },
      payment: { method: payment?.method || "online", status: payment?.method === "cod" ? "pending" : "pending" },
      deliveryAddress,
      promoCode,
      isScheduled: !!scheduledFor,
      scheduledFor,
      statusHistory: [{ status: "placed", timestamp: new Date() }]
    });

    // Deduct wallet if used
    if (walletUsed > 0) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { "wallet.balance": -walletUsed, "wallet.totalDebited": walletUsed }
      });
      await WalletTx.create({ user: req.user._id, type: "debit", amount: walletUsed, description: "Order payment", category: "order", orderId: order._id });
    }

    await Shop.findByIdAndUpdate(shopId, { $inc: { totalOrders: 1, totalRevenue: total } });

    // Emit to shop via socket
    if (global.io) global.io.to(`shop_${shopId}`).emit("new_order", { orderId: order._id, orderNumber: order.orderNumber });

    // Create notification
    await Notification.create({ user: req.user._id, title: "Order Placed! 🎉", body: `Order #${order.orderNumber} placed from ${shop.name}`, type: "order", data: { orderId: order._id } });

    const populated = await Order.findById(order._id).populate("shop", "name logo").populate("items.product", "name images");
    res.status(201).json({ success: true, order: populated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── GET MY ORDERS ──────────────────────────────────────── */
router.get("/my", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { user: req.user._id };
    if (status) query.orderStatus = status;
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate("shop", "name logo address.city");
    const total = await Order.countDocuments(query);
    res.json({ success: true, orders, total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── GET ORDER BY ID ────────────────────────────────────── */
router.get("/:id", protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("shop", "name logo contact address")
      .populate("items.product", "name images");
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ error: "Not authorized" });
    }
    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── UPDATE ORDER STATUS (shop/delivery/admin) ──────────── */
router.patch("/:id/status", protect, async (req, res) => {
  try {
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    order.orderStatus = status;
    order.statusHistory.push({ status, timestamp: new Date(), note });
    if (status === "delivered") {
      order.deliveredAt = new Date();
      // Add loyalty points
      const loyaltyEarned = Math.floor(order.pricing.total * 2);
      order.loyaltyEarned = loyaltyEarned;
      await User.findByIdAndUpdate(order.user, {
        $inc: { "loyalty.points": loyaltyEarned, "loyalty.lifetime": loyaltyEarned }
      });
      await Notification.create({ user: order.user, title: "Order Delivered! 🎉", body: `Your order #${order.orderNumber} has been delivered. Enjoy! 🍽️`, type: "delivery", data: { orderId: order._id } });
    }
    await order.save();

    if (global.io) global.io.to(`order_${order._id}`).emit("status_update", { status, timestamp: new Date() });

    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── CANCEL ORDER ───────────────────────────────────────── */
router.patch("/:id/cancel", protect, async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!["placed","confirmed"].includes(order.orderStatus)) {
      return res.status(400).json({ error: "Cannot cancel order at this stage" });
    }
    order.orderStatus = "cancelled";
    order.cancellationReason = reason;
    order.statusHistory.push({ status: "cancelled", timestamp: new Date(), note: reason });

    // Refund wallet amount
    if (order.pricing.walletUsed > 0 || order.payment.status === "paid") {
      const refundAmt = order.pricing.walletUsed + (order.payment.status === "paid" ? order.pricing.total - order.pricing.walletUsed : 0);
      if (refundAmt > 0) {
        await User.findByIdAndUpdate(order.user, {
          $inc: { "wallet.balance": refundAmt, "wallet.totalCredited": refundAmt }
        });
        await WalletTx.create({ user: order.user, type: "credit", amount: refundAmt, description: `Refund for Order #${order.orderNumber}`, category: "refund", orderId: order._id });
        order.refundAmount = refundAmt;
        order.refundStatus = "processed";
      }
    }
    await order.save();
    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── RATE ORDER ─────────────────────────────────────────── */
router.post("/:id/rate", protect, async (req, res) => {
  try {
    const { rating, review, tags } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    order.rating = rating;
    order.review = [review, ...(tags||[])].filter(Boolean).join(" · ");
    order.reviewedAt = new Date();
    await order.save();

    // Update shop rating
    const orders = await Order.find({ shop: order.shop, rating: { $exists: true, $ne: null } });
    const avgRating = orders.reduce((a, o) => a + o.rating, 0) / orders.length;
    await Shop.findByIdAndUpdate(order.shop, { rating: avgRating.toFixed(1), totalRatings: orders.length });

    // Bonus loyalty points for review
    await User.findByIdAndUpdate(req.user._id, { $inc: { "loyalty.points": 50 } });
    res.json({ success: true, message: "Review submitted! +50 loyalty points earned 🌟" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
