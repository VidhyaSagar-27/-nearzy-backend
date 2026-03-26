"use strict";
const router = require("express").Router();
const { Product } = require("../models");
const { protect } = require("../middleware/auth");

router.get("/", async (req, res) => {
  try {
    const { shopId, category, search, flash, popular, page = 1, limit = 50 } = req.query;
    const query = { isAvailable: true };
    if (shopId) query.shop = shopId;
    if (category) query.category = category;
    if (flash === "true") query.isFlashDeal = true;
    if (popular === "true") query.isPopular = true;
    if (search) query.$text = { $search: search };
    const products = await Product.find(query).populate("shop","name logo address.city delivery").sort({ isBestSeller:-1, isPopular:-1 }).skip((page-1)*limit).limit(Number(limit));
    const total = await Product.countDocuments(query);
    res.json({ success: true, products, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("shop","name logo timing delivery address");
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json({ success: true, product });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/", protect, async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json({ success: true, product });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/:id", protect, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, product });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/:id", protect, async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { isAvailable: false });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
