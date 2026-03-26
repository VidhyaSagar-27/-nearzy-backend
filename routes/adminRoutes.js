const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Shop = require("../models/Shop");
const Order = require("../models/Order");
const Commission = require("../models/Commission");
const Product = require("../models/Product");
const DeliveryBoy = require("../models/DeliveryBoy");
const { auth, adminOnly, superAdminOnly } = require("../middleware/auth");

// DASHBOARD STATS
router.get("/stats", auth, adminOnly, async (req, res) => {
  try {
    const [users, shops, orders, pendingShops, revenue, deliveryBoys] = await Promise.all([
      User.countDocuments({ role: "customer" }),
      Shop.countDocuments({ isApproved: true }),
      Order.countDocuments(),
      Shop.countDocuments({ isApproved: false }),
      Commission.aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, total: { $sum: "$commissionAmount" } } }]),
      DeliveryBoy.countDocuments({ isVerified: true })
    ]);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayOrders = await Order.countDocuments({ createdAt: { $gte: todayStart } });
    res.json({
      totalCustomers: users,
      totalShops: shops,
      totalOrders: orders,
      todayOrders,
      pendingShops,
      totalRevenue: revenue[0]?.total || 0,
      totalDeliveryBoys: deliveryBoys
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ALL USERS
router.get("/users", auth, adminOnly, async (req, res) => {
  try {
    const { role, page = 1, limit = 50 } = req.query;
    const query = role ? { role } : {};
    const users = await User.find(query).select("-password")
      .skip((page - 1) * limit).limit(Number(limit))
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// SUSPEND USER
router.put("/users/:id/suspend", auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    res.json({ message: "User suspended", user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ACTIVATE USER
router.put("/users/:id/activate", auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    res.json({ message: "User activated", user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PENDING SHOPS
router.get("/pending-shops", auth, adminOnly, async (req, res) => {
  try {
    const shops = await Shop.find({ isApproved: false, isActive: true })
      .populate("owner", "name email phone").sort({ createdAt: -1 });
    res.json(shops);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// COMMISSION REPORT
router.get("/commissions", auth, adminOnly, async (req, res) => {
  try {
    const commissions = await Commission.find()
      .populate("shop", "name").populate("order", "orderNumber totalAmount")
      .sort({ createdAt: -1 }).limit(100);
    res.json(commissions);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELIVERY BOYS
router.get("/delivery-boys", auth, adminOnly, async (req, res) => {
  try {
    const boys = await DeliveryBoy.find()
      .populate("user", "name email phone city").sort({ createdAt: -1 });
    res.json(boys);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// VERIFY DELIVERY BOY
router.put("/delivery-boys/:id/verify", auth, adminOnly, async (req, res) => {
  try {
    const boy = await DeliveryBoy.findByIdAndUpdate(req.params.id, { isVerified: true }, { new: true });
    res.json({ message: "Delivery boy verified", boy });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// SUPERADMIN - CREATE ADMIN
router.post("/create-admin", auth, superAdminOnly, async (req, res) => {
  try {
    const bcrypt = require("bcryptjs");
    const { name, email, phone, password, city } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const admin = new User({ name, email, phone, password: hashed, role: "admin", city });
    await admin.save();
    res.status(201).json({ message: "Admin created", admin: { id: admin._id, name: admin.name, email: admin.email } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;