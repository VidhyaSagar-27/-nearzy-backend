const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const Order = require("../models/Order");
const { auth } = require("../middleware/auth");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// CREATE RAZORPAY ORDER
router.post("/create-order", auth, async (req, res) => {
  try {
    const { amount, currency = "INR", notes } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ message: "Invalid amount" });
    const options = {
      amount: Math.round(amount * 100),
      currency,
      receipt: "nearzy_" + Date.now(),
      notes: notes || {}
    };
    const order = await razorpay.orders.create(options);
    res.json({ success: true, order, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error("Razorpay error:", err);
    res.status(500).json({ message: err.message });
  }
});

// VERIFY PAYMENT
router.post("/verify", auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body).digest("hex");
    if (expectedSignature !== razorpay_signature)
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    // Update order payment status
    if (orderId) {
      await Order.findByIdAndUpdate(orderId, {
        paymentStatus: "paid",
        paymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        $push: { tracking: { status: "confirmed", message: "Payment received" } }
      });
    }
    res.json({ success: true, message: "Payment verified", paymentId: razorpay_payment_id });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// REFUND
router.post("/refund", auth, async (req, res) => {
  try {
    const { paymentId, amount } = req.body;
    const refund = await razorpay.payments.refund(paymentId, { amount: Math.round(amount * 100) });
    res.json({ success: true, refund });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;