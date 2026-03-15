const express = require("express");
const router = express.Router();
const Shop = require("../models/Shop");
const User = require("../models/User");
const { auth, adminOnly, sellerOnly } = require("../middleware/auth");

// GET ALL APPROVED SHOPS (public)
router.get("/", async (req, res) => {
  try {
    const { category, city, search, page = 1, limit = 20 } = req.query;
    const query = { isApproved: true, isActive: true };
    if (category) query.category = category;
    if (city) query.city = new RegExp(city, "i");
    if (search) query.name = new RegExp(search, "i");
    const shops = await Shop.find(query)
      .populate("owner", "name email phone")
      .skip((page - 1) * limit).limit(Number(limit))
      .sort({ rating: -1, createdAt: -1 });
    res.json(shops);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET SINGLE SHOP
router.get("/:id", async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).populate("owner", "name email phone");
    if (!shop) return res.status(404).json({ message: "Shop not found" });
    res.json(shop);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET MY SHOP
router.get("/seller/my-shop", auth, async (req, res) => {
  try {
    const shop = await Shop.findOne({ owner: req.user.id });
    res.json(shop || null);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// CREATE / UPDATE MY SHOP
router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "seller") return res.status(403).json({ message: "Sellers only" });
    const existing = await Shop.findOne({ owner: req.user.id });
    if (existing) {
      const updated = await Shop.findByIdAndUpdate(existing._id, req.body, { new: true });
      return res.json({ message: "Shop updated", shop: updated });
    }
    const shop = new Shop({ ...req.body, owner: req.user.id, isApproved: false });
    const saved = await shop.save();
    await User.findByIdAndUpdate(req.user.id, { shopId: saved._id });
    res.status(201).json({ message: "Shop created. Awaiting admin approval.", shop: saved });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// TOGGLE SHOP OPEN/CLOSE
router.put("/toggle-status", auth, async (req, res) => {
  try {
    const shop = await Shop.findOne({ owner: req.user.id });
    if (!shop) return res.status(404).json({ message: "Shop not found" });
    shop.isOpen = !shop.isOpen;
    await shop.save();
    res.json({ message: `Shop is now ${shop.isOpen ? "Open" : "Closed"}`, isOpen: shop.isOpen });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADMIN - GET ALL SHOPS
router.get("/admin/all", auth, adminOnly, async (req, res) => {
  try {
    const shops = await Shop.find().populate("owner", "name email phone").sort({ createdAt: -1 });
    res.json(shops);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADMIN - APPROVE SHOP
router.put("/admin/approve/:id", auth, adminOnly, async (req, res) => {
  try {
    const shop = await Shop.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true });
    res.json({ message: "Shop approved", shop });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADMIN - REJECT / SUSPEND SHOP
router.put("/admin/suspend/:id", auth, adminOnly, async (req, res) => {
  try {
    const shop = await Shop.findByIdAndUpdate(req.params.id, { isActive: false, isApproved: false }, { new: true });
    res.json({ message: "Shop suspended", shop });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;