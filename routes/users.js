"use strict";
const router = require("express").Router();
const { protect } = require("../middleware/auth");
const { User } = require("../models");

router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password -otp");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ success: true, user });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put("/me", protect, async (req, res) => {
  try {
    const allowed = ["name","avatar","city","birthday","preferences","phone"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select("-password -otp");
    res.json({ success: true, user });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put("/me/password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+password");
    const ok = await user.comparePassword(currentPassword);
    if (!ok) return res.status(400).json({ message: "Current password incorrect" });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: "Password updated" });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get("/me/addresses", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("addresses");
    res.json({ success: true, addresses: user.addresses });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/me/addresses", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (req.body.isDefault) user.addresses.forEach(a => a.isDefault = false);
    user.addresses.push(req.body);
    await user.save();
    res.json({ success: true, addresses: user.addresses });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete("/me/addresses/:id", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.addresses = user.addresses.filter(a => a._id.toString() !== req.params.id);
    await user.save();
    res.json({ success: true, addresses: user.addresses });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put("/me/push-token", protect, async (req, res) => {
  try {
    const { fcmToken, pushSubscription } = req.body;
    await User.findByIdAndUpdate(req.user._id, { fcmToken, pushSubscription });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
