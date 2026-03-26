"use strict";
const router = require("express").Router();
const crypto = require("crypto");
const { protect } = require("../middleware/auth");
const { Order, User, WalletTx, Notification } = require("../models");

let Razorpay;
try { Razorpay = require("razorpay"); } catch(e) {}

const getRazorpay = () => {
  if (!Razorpay) throw new Error("Razorpay package not installed");
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
};

/* ─── CREATE ORDER ───────────────────────────────────────── */
router.post("/create-order", protect, async (req, res) => {
  try {
    const { amount, notes = {} } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: "Invalid amount" });

    const rzp = getRazorpay();
    const order = await rzp.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      notes: { userId: req.user._id.toString(), ...notes }
    });
    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── VERIFY PAYMENT ─────────────────────────────────────── */
router.post("/verify", protect, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    if (orderId) {
      const order = await Order.findById(orderId);
      if (order) {
        order.payment.status = "paid";
        order.payment.razorpayOrderId = razorpay_order_id;
        order.payment.razorpayPaymentId = razorpay_payment_id;
        order.payment.paidAt = new Date();
        await order.save();
      }
    }

    await Notification.create({
      user: req.user._id,
      title: "Payment Successful! 💳",
      body: "Your payment has been confirmed.",
      type: "payment"
    });

    res.json({ success: true, message: "Payment verified" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── WEBHOOK ─────────────────────────────────────────────── */
router.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const body = req.body;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(JSON.stringify(body))
      .digest("hex");
    if (signature !== expectedSignature) return res.status(400).json({ error: "Invalid signature" });
    // Handle events
    const event = body.event;
    if (event === "payment.captured") {
      console.log("Payment captured:", body.payload.payment.entity.id);
    }
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
