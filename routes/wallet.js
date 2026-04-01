"use strict";
const router   = require("express").Router();
const auth     = require("../middleware/auth");
const mongoose = require("mongoose");

/* ── Wallet Schema (inline for simplicity) ── */
const txnSchema = new mongoose.Schema({
  user:          { type: mongoose.Types.ObjectId, ref: "User", required: true, index: true },
  type:          { type: String, enum: ["credit","debit"], required: true },
  amount:        { type: Number, required: true },
  balanceAfter:  Number,
  description:   String,
  reference:     String,
  createdAt:     { type: Date, default: Date.now }
});
const WalletTxn = mongoose.models.WalletTxn || mongoose.model("WalletTxn", txnSchema);

const walletSchema = new mongoose.Schema({
  user:          { type: mongoose.Types.ObjectId, ref: "User", required: true, unique: true },
  balance:       { type: Number, default: 0, min: 0 },
  totalCredited: { type: Number, default: 0 },
  totalDebited:  { type: Number, default: 0 },
  updatedAt:     { type: Date, default: Date.now }
});
const Wallet = mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);

/* Helper: get or create wallet */
async function getWallet(userId) {
  let w = await Wallet.findOne({ user: userId });
  if (!w) w = await Wallet.create({ user: userId });
  return w;
}

/* GET /api/wallet/balance */
router.get("/balance", auth, async (req, res) => {
  try {
    const w = await getWallet(req.user._id || req.user.id);
    res.json({ balance: w.balance, totalCredited: w.totalCredited, totalDebited: w.totalDebited });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GET /api/wallet/transactions */
router.get("/transactions", auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const txns  = await WalletTxn.find({ user: req.user._id || req.user.id }).sort({ createdAt: -1 }).limit(limit);
    res.json({ transactions: txns });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /api/wallet/topup-create — create Razorpay order for topup */
router.post("/topup-create", auth, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount < 10) return res.status(400).json({ error: "Minimum top-up is ₹10" });
  if (amount > 50000) return res.status(400).json({ error: "Maximum top-up is ₹50,000" });
  try {
    const Razorpay = require("razorpay");
    const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const order = await rzp.orders.create({ amount: Math.round(amount * 100), currency: "INR", notes: { purpose: "wallet_topup", userId: String(req.user._id || req.user.id) } });
    res.json({ order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /api/wallet/topup-verify — verify and credit wallet */
router.post("/topup-verify", auth, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
  if (!razorpay_payment_id || !amount) return res.status(400).json({ error: "Payment details required" });
  try {
    const crypto  = require("crypto");
    const hmac    = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "");
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = hmac.digest("hex");
    if (digest !== razorpay_signature) return res.status(400).json({ error: "Payment verification failed" });

    const uid = req.user._id || req.user.id;
    const w   = await getWallet(uid);
    const newBalance = parseFloat((w.balance + parseFloat(amount)).toFixed(2));

    await Wallet.findOneAndUpdate({ user: uid }, { balance: newBalance, $inc: { totalCredited: parseFloat(amount) }, updatedAt: new Date() });
    await WalletTxn.create({ user: uid, type: "credit", amount: parseFloat(amount), balanceAfter: newBalance, description: `Wallet top-up via Razorpay`, reference: razorpay_payment_id });
    res.json({ success: true, balance: newBalance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /api/wallet/debit — debit wallet (called during order checkout) */
router.post("/debit", auth, async (req, res) => {
  const { amount, description, reference } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
  try {
    const uid = req.user._id || req.user.id;
    const w   = await getWallet(uid);
    if (w.balance < amount) return res.status(400).json({ error: "Insufficient wallet balance" });
    const newBalance = parseFloat((w.balance - parseFloat(amount)).toFixed(2));
    await Wallet.findOneAndUpdate({ user: uid }, { balance: newBalance, $inc: { totalDebited: parseFloat(amount) }, updatedAt: new Date() });
    await WalletTxn.create({ user: uid, type: "debit", amount: parseFloat(amount), balanceAfter: newBalance, description: description || "Order payment", reference });
    res.json({ success: true, balance: newBalance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.getWallet = getWallet;
module.exports.Wallet = Wallet;
module.exports.WalletTxn = WalletTxn;