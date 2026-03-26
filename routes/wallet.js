"use strict";
const router = require("express").Router();
const crypto = require("crypto");
const { protect } = require("../middleware/auth");
const { User, WalletTx, Notification } = require("../models");

let Razorpay;
try { Razorpay = require("razorpay"); } catch(e) {}

const getRazorpay = () => new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });

/* ─── GET BALANCE ────────────────────────────────────────── */
router.get("/balance", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("wallet");
    res.json({ success: true, balance: user.wallet.balance, totalCredited: user.wallet.totalCredited, totalDebited: user.wallet.totalDebited });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── GET TRANSACTIONS ───────────────────────────────────── */
router.get("/transactions", protect, async (req, res) => {
  try {
    const { limit = 50, page = 1, type } = req.query;
    const query = { user: req.user._id };
    if (type) query.type = type;
    const transactions = await WalletTx.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await WalletTx.countDocuments(query);
    res.json({ success: true, transactions, total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── CREATE TOP-UP ORDER ────────────────────────────────── */
router.post("/topup-create", protect, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 10 || amount > 10000) return res.status(400).json({ error: "Amount must be between ₹10-₹10,000" });

    const rzp = getRazorpay();
    const order = await rzp.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      notes: { userId: req.user._id.toString(), purpose: "wallet_topup" }
    });
    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── VERIFY TOP-UP ──────────────────────────────────────── */
router.post("/topup-verify", protect, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (expectedSig !== razorpay_signature) return res.status(400).json({ error: "Signature mismatch" });

    const user = await User.findByIdAndUpdate(req.user._id, {
      $inc: { "wallet.balance": amount, "wallet.totalCredited": amount }
    }, { new: true });

    const tx = await WalletTx.create({
      user: req.user._id, type: "credit", amount, balanceAfter: user.wallet.balance,
      description: "Wallet Top-up via Razorpay", category: "topup", razorpayId: razorpay_payment_id
    });

    await Notification.create({ user: req.user._id, title: "Wallet Topped Up! 💰", body: `₹${amount} added to your Nearzy Wallet`, type: "wallet" });

    res.json({ success: true, balance: user.wallet.balance, transaction: tx });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── CREDIT WALLET (admin/system) ──────────────────────── */
router.post("/credit", protect, async (req, res) => {
  try {
    const { amount, description, category, userId } = req.body;
    if (req.user.role !== "admin" && userId !== req.user._id.toString()) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const targetId = userId || req.user._id;
    const user = await User.findByIdAndUpdate(targetId, {
      $inc: { "wallet.balance": amount, "wallet.totalCredited": amount }
    }, { new: true });

    await WalletTx.create({ user: targetId, type: "credit", amount, balanceAfter: user.wallet.balance, description, category: category || "reward" });
    res.json({ success: true, balance: user.wallet.balance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
