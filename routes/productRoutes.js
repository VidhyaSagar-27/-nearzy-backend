const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Shop = require("../models/Shop");
const { auth } = require("../middleware/auth");

// GET ALL PRODUCTS (public)
router.get("/", async (req, res) => {
  try {
    const { shop, category, search, page = 1, limit = 50 } = req.query;
    const query = { isActive: true };
    if (shop) query.shop = shop;
    if (category) query.category = new RegExp(category, "i");
    if (search) query.name = new RegExp(search, "i");
    const products = await Product.find(query)
      .populate("shop", "name category city")
      .skip((page - 1) * limit).limit(Number(limit))
      .sort({ isFeatured: -1, createdAt: -1 });
    res.json(products);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET MY PRODUCTS
router.get("/my-products", auth, async (req, res) => {
  try {
    const shop = await Shop.findOne({ owner: req.user.id });
    if (!shop) return res.status(404).json({ message: "No shop found" });
    const products = await Product.find({ shop: shop._id }).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET SINGLE PRODUCT
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("shop", "name category");
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADD PRODUCT
router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "seller") return res.status(403).json({ message: "Sellers only" });
    const shop = await Shop.findOne({ owner: req.user.id });
    if (!shop) return res.status(404).json({ message: "Create your shop first" });
    if (!shop.isApproved) return res.status(403).json({ message: "Shop pending approval" });
    const product = new Product({ ...req.body, seller: req.user.id, shop: shop._id });
    const saved = await product.save();
    res.status(201).json({ message: "Product added", product: saved });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// UPDATE PRODUCT
router.put("/:id", auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Not found" });
    if (product.seller.toString() !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ message: "Not authorized" });
    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: "Updated", product: updated });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE PRODUCT
router.delete("/:id", auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Not found" });
    if (product.seller.toString() !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ message: "Not authorized" });
    await product.deleteOne();
    res.json({ message: "Product deleted" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADD REVIEW
router.post("/:id/review", auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Not found" });
    const already = product.reviews.find(r => r.user.toString() === req.user.id);
    if (already) return res.status(400).json({ message: "Already reviewed" });
    product.reviews.push({ user: req.user.id, name: req.body.name, rating: Number(rating), comment });
    product.ratingCount = product.reviews.length;
    product.rating = product.reviews.reduce((a, b) => a + b.rating, 0) / product.reviews.length;
    await product.save();
    res.json({ message: "Review added" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;