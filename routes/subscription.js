"use strict";
const router = require("express").Router();
const { protect } = require("../middleware/auth");
const { User, WalletTx } = require("../models");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/* GET /api/subscription/status */
router.get("/status", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("subscription");
    res.json({ success: true, subscription: user.subscription });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* POST /api/subscription/activate */
router.post("/activate", protect, async (req, res) => {
  try {
    const { plan, razorpay_payment_id } = req.body;
    const PRICES = { monthly: 149, yearly: 999 };
    if (!PRICES[plan]) return res.status(400).json({ message: "Invalid plan" });

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + (plan === "yearly" ? 365 : 30));

    await User.findByIdAndUpdate(req.user._id, {
      subscription: { active: true, plan, expiry, startedAt: new Date() }
    });

    // Monthly ₹100 wallet credit for Pro members
    if (plan === "monthly" || plan === "yearly") {
      const user = await User.findById(req.user._id);
      user.wallet.balance += 100;
      user.wallet.totalCredited += 100;
      await user.save();
      await WalletTx.create({ user: user._id, type: "credit", amount: 100, balanceAfter: user.wallet.balance, description: "Nearzy Pro welcome credit", category: "reward" });
    }

    res.json({ success: true, message: `Nearzy Pro ${plan} activated!`, expiry });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* POST /api/subscription/cancel */
router.post("/cancel", protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      "subscription.active": false
    });
    res.json({ success: true, message: "Subscription cancelled" });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
