"use strict";
const router = require("express").Router();
const { Shop, Product } = require("../models");

/* GET /api/search?q=biryani&city=Hyderabad */
router.get("/", async (req, res) => {
  try {
    const { q, city, category, limit = 20 } = req.query;
    if (!q || q.trim().length < 2) return res.json({ success: true, results: { shops: [], products: [] } });

    const regex = new RegExp(q.trim(), "i");
    const cityFilter = city ? { "address.city": new RegExp(city, "i") } : {};

    const [shops, products] = await Promise.all([
      Shop.find({ ...cityFilter, isActive: true, $or: [{ name: regex }, { tags: regex }, { cuisine: regex }] })
        .select("name category address rating delivery images logo").limit(parseInt(limit)),
      Product.find({ isAvailable: true, $or: [{ name: regex }, { description: regex }, { tags: regex }] })
        .populate("shop", "name address.city").limit(parseInt(limit))
    ]);

    res.json({ success: true, results: { shops, products } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* GET /api/search/suggestions?q=bir */
router.get("/suggestions", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json({ suggestions: [] });
    const regex = new RegExp("^" + q, "i");
    const [shops, products] = await Promise.all([
      Shop.find({ isActive: true, name: regex }).select("name category").limit(5),
      Product.find({ isAvailable: true, name: regex }).select("name").limit(5)
    ]);
    const suggestions = [
      ...shops.map(s => ({ text: s.name, type: "shop", category: s.category })),
      ...products.map(p => ({ text: p.name, type: "product" }))
    ];
    res.json({ success: true, suggestions });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
