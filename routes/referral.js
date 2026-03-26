"use strict";
const router = require("express").Router();
const { protect } = require("../middleware/auth");
const { User, WalletTx } = require("../models");

/* GET /api/referral/my-code */
router.get("/my-code", protect, async (req, res) => {
  try {
    let user = await User.findById(req.user._id);
    if (!user.referralCode) {
      user.referralCode = "NRZ" + user.name.slice(0,3).toUpperCase() + user._id.toString().slice(-4).toUpperCase();
      await user.save();
    }
    res.json({ success: true, code: user.referralCode, count: user.referralCount, earned: user.referralEarned });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* POST /api/referral/apply — called when new user signs up with ref code */
router.post("/apply", protect, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Referral code required" });

    const referrer = await User.findOne({ referralCode: code.toUpperCase() });
    if (!referrer) return res.status(404).json({ message: "Invalid referral code" });
    if (referrer._id.equals(req.user._id)) return res.status(400).json({ message: "Cannot use your own code" });

    const me = await User.findById(req.user._id);
    if (me.referredBy) return res.status(400).json({ message: "Already used a referral code" });

    const REWARD = 50;

    // Credit referrer
    referrer.wallet.balance += REWARD;
    referrer.wallet.totalCredited += REWARD;
    referrer.referralCount += 1;
    referrer.referralEarned += REWARD;
    await referrer.save();
    await WalletTx.create({ user: referrer._id, type: "credit", amount: REWARD, balanceAfter: referrer.wallet.balance, description: `Referral reward — ${me.name} signed up`, category: "referral" });

    // Credit new user
    me.wallet.balance += REWARD;
    me.wallet.totalCredited += REWARD;
    me.referredBy = referrer._id;
    await me.save();
    await WalletTx.create({ user: me._id, type: "credit", amount: REWARD, balanceAfter: me.wallet.balance, description: `Welcome bonus — referred by ${referrer.name}`, category: "referral" });

    res.json({ success: true, message: `₹${REWARD} added to both wallets!` });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
