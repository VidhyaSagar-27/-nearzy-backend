"use strict";
const router = require("express").Router();
const { Shop, Product } = require("../models");
const { protect, authorize, optionalAuth } = require("../middleware/auth");

/* ─── GET ALL SHOPS ──────────────────────────────────────── */
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { city, category, search, featured, page = 1, limit = 20, sort = "rating" } = req.query;
    const query = { isActive: true };
    if (city) query["address.city"] = new RegExp(city, "i");
    if (category) query.category = category;
    if (featured === "true") query.isFeatured = true;
    if (search) query.$text = { $search: search };

    const sortMap = { rating: { rating: -1 }, orders: { totalOrders: -1 }, newest: { createdAt: -1 } };
    const shops = await Shop.find(query)
      .sort(sortMap[sort] || { isFeatured: -1, rating: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select("-bankDetails -commissionRate");

    const total = await Shop.countDocuments(query);
    res.json({ success: true, shops, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── GET SHOP BY ID ─────────────────────────────────────── */
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).populate("owner", "name email phone").select("-bankDetails -commissionRate");
    if (!shop || !shop.isActive) return res.status(404).json({ error: "Shop not found" });
    res.json({ success: true, shop });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── GET SHOP PRODUCTS ──────────────────────────────────── */
router.get("/:id/products", async (req, res) => {
  try {
    const { category, search, page = 1, limit = 50 } = req.query;
    const query = { shop: req.params.id, isAvailable: true };
    if (category) query.category = category;
    if (search) query.$text = { $search: search };

    const products = await Product.find(query)
      .sort({ isPopular: -1, isBestSeller: -1, totalSold: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const categories = await Product.distinct("category", { shop: req.params.id, isAvailable: true });
    res.json({ success: true, products, categories });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── CREATE SHOP ─────────────────────────────────────────── */
router.post("/", protect, async (req, res) => {
  try {
    const shop = await Shop.create({ ...req.body, owner: req.user._id });
    res.status(201).json({ success: true, shop });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── UPDATE SHOP ─────────────────────────────────────────── */
router.put("/:id", protect, async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ error: "Shop not found" });
    if (shop.owner.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ error: "Not authorized" });
    }
    const updated = await Shop.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, shop: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── TOGGLE SHOP STATUS ─────────────────────────────────── */
router.patch("/:id/toggle", protect, async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ error: "Shop not found" });
    if (shop.owner.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ error: "Not authorized" });
    }
    shop.timing.isOpen = !shop.timing.isOpen;
    await shop.save();
    res.json({ success: true, isOpen: shop.timing.isOpen });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── MY SHOPS (owner) ───────────────────────────────────── */
router.get("/my/shops", protect, async (req, res) => {
  try {
    const shops = await Shop.find({ owner: req.user._id });
    res.json({ success: true, shops });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
