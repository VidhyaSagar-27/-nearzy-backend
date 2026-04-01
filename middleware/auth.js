"use strict";
const router   = require("express").Router();
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name:      { type:String, required:true, trim:true },
  email:     { type:String, required:true, unique:true, lowercase:true, trim:true },
  phone:     { type:String, trim:true },
  password:  { type:String, required:true },
  role:      { type:String, enum:["customer","seller","delivery","admin","superadmin"], default:"customer" },
  city:      String,
  avatar:    String,
  isActive:  { type:Boolean, default:true },
  loyaltyPoints: { type:Number, default:0 },
  referralCode:  String,
  createdAt: { type:Date, default:Date.now }
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

function signToken(user) {
  return jwt.sign(
    { _id:user._id, id:user._id, name:user.name, email:user.email, role:user.role, city:user.city },
    process.env.JWT_SECRET||"nearzy_super_secret_2025",
    { expiresIn: process.env.JWT_EXPIRES_IN||"30d" }
  );
}

/* POST /api/auth/signup */
router.post("/signup", async (req, res) => {
  try {
    const { name, email, phone, password, role, city, referralCode } = req.body;
    if (!name||!email||!password) return res.status(400).json({ error:"Name, email and password are required" });
    if (password.length < 6) return res.status(400).json({ error:"Password must be at least 6 characters" });
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ error:"Email already registered. Please login." });
    const hashed = await bcrypt.hash(password, 10);
    const user   = await User.create({ name:name.trim(), email:email.toLowerCase().trim(), phone, password:hashed, role:role||"customer", city, referralCode:"NRZ"+Math.random().toString(36).substring(2,6).toUpperCase() });
    const token  = signToken(user);
    res.json({ token, user:{ _id:user._id, name:user.name, email:user.email, phone:user.phone, role:user.role, city:user.city, loyaltyPoints:user.loyaltyPoints } });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* POST /api/auth/login */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email||!password) return res.status(400).json({ error:"Email and password required" });
    const user = await User.findOne({ email:email.toLowerCase() });
    if (!user) return res.status(401).json({ error:"No account found with this email" });
    if (!user.isActive) return res.status(401).json({ error:"Account suspended. Contact support." });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error:"Incorrect password" });
    const token = signToken(user);
    res.json({ token, user:{ _id:user._id, name:user.name, email:user.email, phone:user.phone, role:user.role, city:user.city, loyaltyPoints:user.loyaltyPoints } });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* POST /api/auth/logout */
router.post("/logout", (req, res) => res.json({ success:true }));

module.exports = router;
module.exports.User = User;