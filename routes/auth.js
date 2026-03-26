"use strict";
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { User } = require("../models");
const { protect } = require("../middleware/auth");

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET || "nearzy_secret", { expiresIn: "30d" });

/* ─── REGISTER ──────────────────────────────────────────── */
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, city, referralCode } = req.body;
    if (!name || (!email && !phone) || !password) {
      return res.status(400).json({ error: "Name, email/phone, and password are required" });
    }
    const existing = await User.findOne({ $or: [{ email: email || null }, { phone: phone || null }] });
    if (existing) return res.status(409).json({ error: "User already exists with this email/phone" });

    const refCode = "NRZ" + name.slice(0,3).toUpperCase() + Math.random().toString(36).slice(2,6).toUpperCase();
    const user = await User.create({ name, email, phone, password, city: city || "Ramagundam", referralCode: refCode });

    // Handle referral
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) {
        await User.findByIdAndUpdate(referrer._id, {
          $inc: { "wallet.balance": 50, "wallet.totalCredited": 50, referralCount: 1, referralEarned: 50 }
        });
        user.referredBy = referrer._id;
        user.wallet.balance = 50;
        user.wallet.totalCredited = 50;
        await user.save();
      }
    }

    const token = signToken(user._id);
    res.status(201).json({ success: true, token, user: user.toJSON() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── LOGIN ─────────────────────────────────────────────── */
router.post("/login", async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    if ((!email && !phone) || !password) return res.status(400).json({ error: "Credentials required" });

    const user = await User.findOne({ $or: [{ email: email || null }, { phone: phone || null }] }).select("+password");
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    if (!user.isActive) return res.status(403).json({ error: "Account suspended" });

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user._id);
    res.json({ success: true, token, user: user.toJSON() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── SEND OTP ──────────────────────────────────────────── */
router.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
    let user = await User.findOne({ phone });
    if (!user) {
      user = new User({ phone, name: "User", otp: { code: otp, expiry } });
      await user.save();
    } else {
      await User.findByIdAndUpdate(user._id, { otp: { code: otp, expiry } });
    }
    // TODO: Send OTP via Twilio
    console.log(`OTP for ${phone}: ${otp}`);
    res.json({ success: true, message: "OTP sent", ...(process.env.NODE_ENV !== "production" ? { otp } : {}) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── VERIFY OTP ─────────────────────────────────────────── */
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.otp?.code || user.otp.code !== otp) return res.status(400).json({ error: "Invalid OTP" });
    if (new Date() > user.otp.expiry) return res.status(400).json({ error: "OTP expired" });

    await User.findByIdAndUpdate(user._id, { isVerified: true, otp: null, lastLogin: new Date() });
    const token = signToken(user._id);
    res.json({ success: true, token, user: (await User.findById(user._id)).toJSON() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── GET ME ─────────────────────────────────────────────── */
router.get("/me", protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

/* ─── UPDATE PROFILE ─────────────────────────────────────── */
router.put("/me", protect, async (req, res) => {
  try {
    const allowed = ["name","email","phone","city","avatar","birthday","preferences"];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true });
    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── CHANGE PASSWORD ────────────────────────────────────── */
router.put("/change-password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+password");
    if (!await user.comparePassword(currentPassword)) return res.status(400).json({ error: "Wrong current password" });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: "Password changed" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── ADDRESSES ──────────────────────────────────────────── */
router.post("/address", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (req.body.isDefault) user.addresses.forEach(a => a.isDefault = false);
    user.addresses.push(req.body);
    await user.save();
    res.json({ success: true, addresses: user.addresses });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/address/:id", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.addresses = user.addresses.filter(a => a._id.toString() !== req.params.id);
    await user.save();
    res.json({ success: true, addresses: user.addresses });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
