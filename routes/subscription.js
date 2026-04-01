"use strict";
const router   = require("express").Router();
const auth     = require("../middleware/auth");
const mongoose = require("mongoose");
const crypto   = require("crypto");

const subSchema = new mongoose.Schema({
  user:       { type: mongoose.Types.ObjectId, ref: "User", required: true, unique: true },
  active:     { type: Boolean, default: false },
  plan:       { type: String, enum: ["monthly","yearly"], default: "monthly" },
  expiry:     Date,
  paymentId:  String,
  orderId:    String,
  activatedAt:{ type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now }
});
const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subSchema);

/* GET /api/subscription/status */
router.get("/status", auth, async (req, res) => {
  try {
    const uid = req.user._id || req.user.id;
    const sub = await Subscription.findOne({ user: uid });
    if (!sub || !sub.active || (sub.expiry && new Date(sub.expiry) < new Date())) {
      if (sub?.active) await Subscription.updateOne({ user: uid }, { active: false });
      return res.json({ active: false });
    }
    res.json({ active: true, plan: sub.plan, expiry: sub.expiry, paymentId: sub.paymentId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /api/subscription/activate */
router.post("/activate", auth, async (req, res) => {
  const { plan, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_payment_id) return res.status(400).json({ error: "Payment ID required" });

  /* Verify Razorpay signature */
  try {
    if (razorpay_order_id && razorpay_signature) {
      const hmac    = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "");
      hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
      const digest  = hmac.digest("hex");
      if (digest !== razorpay_signature) return res.status(400).json({ error: "Payment verification failed" });
    }

    const uid    = req.user._id || req.user.id;
    const days   = plan === "yearly" ? 365 : 30;
    const expiry = new Date(Date.now() + days * 86400000);

    await Subscription.findOneAndUpdate(
      { user: uid },
      { active: true, plan: plan || "monthly", expiry, paymentId: razorpay_payment_id, orderId: razorpay_order_id, activatedAt: new Date(), updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, active: true, plan, expiry });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /api/subscription/cancel */
router.post("/cancel", auth, async (req, res) => {
  try {
    const uid = req.user._id || req.user.id;
    await Subscription.findOneAndUpdate({ user: uid }, { active: false, updatedAt: new Date() });
    res.json({ success: true, message: "Subscription cancelled. Benefits remain until expiry." });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;