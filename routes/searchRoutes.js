const express = require("express");
const router = express.Router();
const Shop = require("../models/Shop");
const Product = require("../models/Product");

// ─── UNIFIED SEARCH ───────────────────────────────────────────────────────────
// GET /api/search?q=biryani&city=Hyderabad&type=all
router.get("/", async (req, res) => {
  try {
    const { q, city, type = "all", page = 1, limit = 20 } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters" });
    }

    const regex = new RegExp(q.trim(), "i");
    const results = {};

    if (type === "all" || type === "shops") {
      const shopQuery = { isApproved: true, isActive: true, $or: [{ name: regex }, { description: regex }, { category: regex }] };
      if (city) shopQuery.city = new RegExp(city, "i");
      results.shops = await Shop.find(shopQuery)
        .select("name logo category rating deliveryTime city isOpen")
        .limit(10)
        .sort({ rating: -1 });
    }

    if (type === "all" || type === "products") {
      const productQuery = { isActive: true, $or: [{ name: regex }, { description: regex }, { category: regex }, { tags: regex }] };
      results.products = await Product.find(productQuery)
        .populate("shop", "name city isOpen isApproved")
        .select("name price images rating shop category")
        .limit(20)
        .sort({ rating: -1 });
    }

    res.json({
      query: q,
      results,
      totalShops: results.shops?.length || 0,
      totalProducts: results.products?.length || 0
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── TRENDING / POPULAR ───────────────────────────────────────────────────────
// GET /api/search/trending
router.get("/trending", async (req, res) => {
  try {
    const { city } = req.query;
    const shopQuery = { isApproved: true, isActive: true };
    if (city) shopQuery.city = new RegExp(city, "i");

    const [topShops, topProducts] = await Promise.all([
      Shop.find(shopQuery)
        .select("name logo category rating totalOrders city isOpen deliveryTime")
        .sort({ totalOrders: -1, rating: -1 })
        .limit(10),
      Product.find({ isActive: true })
        .populate("shop", "name city isOpen")
        .select("name price images rating category")
        .sort({ rating: -1, ratingCount: -1 })
        .limit(10)
    ]);

    res.json({ topShops, topProducts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
