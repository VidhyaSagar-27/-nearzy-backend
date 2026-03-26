const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const Wallet = require("../models/Wallet");
const Order = require("../models/Order");
const Notification = require("../models/Notification");
const { auth } = require("../middleware/auth");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Helper: get or create wallet for user
async function getOrCreateWallet(userId) {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) {
    wallet = await new Wallet({ user: userId }).save();
  }
  return wallet;
}

// Helper: create notification
async function notify(userId, title, body, type, data = {}) {
  try {
    await new Notification({ user: userId, title, body, type, data }).save();
  } catch (e) {
    console.warn("Notification failed (non-fatal):", e.message);
  }
}

// ─── GET WALLET BALANCE ──────────────────────────────────────────────────────
// GET /api/wallet/balance
router.get("/balance", auth, async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);
    res.json({
      balance: wallet.balance,
      totalCredited: wallet.totalCredited,
      totalDebited: wallet.totalDebited
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET TRANSACTION HISTORY ─────────────────────────────────────────────────
// GET /api/wallet/transactions
router.get("/transactions", auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const wallet = await getOrCreateWallet(req.user.id);
    // Sort newest first, paginate
    const allTx = wallet.transactions.sort((a, b) => b.createdAt - a.createdAt);
    const start = (page - 1) * limit;
    const paginated = allTx.slice(start, start + Number(limit));
    res.json({
      balance: wallet.balance,
      transactions: paginated,
      total: allTx.length,
      page: Number(page),
      pages: Math.ceil(allTx.length / limit)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── CREATE RAZORPAY ORDER FOR WALLET TOP-UP ─────────────────────────────────
// POST /api/wallet/topup-create
router.post("/topup-create", auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 10) {
      return res.status(400).json({ message: "Minimum top-up amount is ₹10" });
    }
    if (amount > 10000) {
      return res.status(400).json({ message: "Maximum top-up amount is ₹10,000" });
    }
    const options = {
      amount: Math.round(amount * 100), // paise
      currency: "INR",
      receipt: "wallet_topup_" + req.user.id + "_" + Date.now(),
      notes: { userId: req.user.id, purpose: "wallet_topup" }
    };
    const order = await razorpay.orders.create(options);
    res.json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
      amount,
      message: "Razorpay order created"
    });
  } catch (err) {
    console.error("Wallet topup create error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ─── VERIFY WALLET TOP-UP PAYMENT ────────────────────────────────────────────
// POST /api/wallet/topup-verify
router.post("/topup-verify", auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Payment details missing" });
    }

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Payment verification failed. Invalid signature." });
    }

    // Credit wallet
    const wallet = await getOrCreateWallet(req.user.id);
    const creditAmount = Number(amount) || 0;
    await wallet.credit(
      creditAmount,
      `Wallet top-up via Razorpay`,
      razorpay_payment_id
    );

    // Send notification
    await notify(
      req.user.id,
      "Wallet Credited! 💰",
      `₹${creditAmount} has been added to your Nearzy wallet.`,
      "wallet",
      { paymentId: razorpay_payment_id, amount: creditAmount }
    );

    res.json({
      success: true,
      message: `₹${creditAmount} added to your wallet successfully!`,
      balance: wallet.balance,
      paymentId: razorpay_payment_id
    });
  } catch (err) {
    console.error("Wallet topup verify error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ─── PAY FOR ORDER USING WALLET ───────────────────────────────────────────────
// POST /api/wallet/pay-order
router.post("/pay-order", auth, async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    if (!orderId || !amount) {
      return res.status(400).json({ message: "orderId and amount required" });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.customer.toString() !== req.user.id)
      return res.status(403).json({ message: "Not your order" });
    if (order.paymentStatus === "paid")
      return res.status(400).json({ message: "Order already paid" });

    const wallet = await getOrCreateWallet(req.user.id);
    if (wallet.balance < amount) {
      return res.status(400).json({
        message: `Insufficient wallet balance. Available: ₹${wallet.balance}, Required: ₹${amount}`
      });
    }

    // Debit wallet
    await wallet.debit(amount, `Order payment #${order.orderNumber}`, orderId);

    // Update order payment status
    order.paymentStatus = "paid";
    order.paymentMethod = "WALLET";
    order.paymentId = "WALLET_" + Date.now();
    order.tracking.push({ status: "confirmed", message: "Payment received via wallet" });
    await order.save();

    await notify(
      req.user.id,
      "Payment Successful! ✅",
      `₹${amount} paid for order #${order.orderNumber} from wallet.`,
      "payment",
      { orderId, amount }
    );

    res.json({
      success: true,
      message: "Payment successful via wallet",
      remainingBalance: wallet.balance,
      order
    });
  } catch (err) {
    if (err.message === "Insufficient wallet balance") {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
});

// ─── ADMIN: MANUALLY CREDIT WALLET (refunds, bonuses etc.) ───────────────────
// POST /api/wallet/admin-credit
router.post("/admin-credit", auth, async (req, res) => {
  try {
    if (!["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { userId, amount, description } = req.body;
    if (!userId || !amount) return res.status(400).json({ message: "userId and amount required" });

    const wallet = await getOrCreateWallet(userId);
    await wallet.credit(amount, description || "Admin credit", "ADMIN");

    await notify(
      userId,
      "Wallet Credited! 🎁",
      `₹${amount} has been added to your wallet. ${description || ""}`,
      "wallet",
      { amount }
    );

    res.json({ success: true, message: `₹${amount} credited to user wallet`, balance: wallet.balance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
