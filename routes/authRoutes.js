const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const DeliveryBoy = require("../models/DeliveryBoy");
const { auth } = require("../middleware/auth");
const router = express.Router();

// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { name, email, phone, password, role, city } = req.body;
    if (!name || !email || !phone || !password) return res.status(400).json({ message: "All fields required" });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already registered" });
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ name, email, phone, password: hashed, role: role || "customer", city: city || "" });
    await user.save();
    // If delivery boy, create delivery profile
    if (role === "delivery") {
      await new DeliveryBoy({ user: user._id, city: city || "" }).save();
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.status(201).json({
      message: "Account created successfully",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, city: user.city }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });
    if (!user.isActive) return res.status(403).json({ message: "Account suspended. Contact support." });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, city: user.city }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET PROFILE
router.get("/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// UPDATE PROFILE
router.put("/profile", auth, async (req, res) => {
  try {
    const { name, phone, address, city } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, { name, phone, address, city }, { new: true }).select("-password");
    res.json({ message: "Profile updated", user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;