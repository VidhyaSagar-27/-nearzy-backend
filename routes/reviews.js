"use strict";
const router = require("express").Router();
const { protect } = require("../middleware/auth");
const { Review, Shop, Product, Order, User } = require("../models");

/* POST /api/reviews */
router.post("/", protect, async (req, res) => {
  try {
    const { orderId, shopId, productId, rating, review, tags, images } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: "Rating 1-5 required" });

    const existing = await Review.findOne({ user: req.user._id, order: orderId });
    if (existing) return res.status(400).json({ message: "Already reviewed this order" });

    const rev = await Review.create({
      user: req.user._id, shop: shopId, product: productId,
      order: orderId, rating, review, tags, images
    });

    // Update shop rating
    if (shopId) {
      const reviews = await Review.find({ shop: shopId });
      const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
      await Shop.findByIdAndUpdate(shopId, { rating: Math.round(avg * 10) / 10, totalRatings: reviews.length });
    }

    // Award loyalty points for review
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { "loyalty.points": 50, "loyalty.lifetime": 50 }
    });

    res.status(201).json({ success: true, review: rev });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* GET /api/reviews/shop/:shopId */
router.get("/shop/:shopId", async (req, res) => {
  try {
    const reviews = await Review.find({ shop: req.params.shopId })
      .populate("user", "name avatar")
      .sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, reviews });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* GET /api/reviews/product/:productId */
router.get("/product/:productId", async (req, res) => {
  try {
    const reviews = await Review.find({ product: req.params.productId })
      .populate("user", "name avatar")
      .sort({ createdAt: -1 }).limit(30);
    res.json({ success: true, reviews });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
