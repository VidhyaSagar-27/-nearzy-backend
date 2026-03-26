"use strict";
const router = require("express").Router();
const { protect } = require("../middleware/auth");
const { Promo, Order } = require("../models");

/* POST /api/promo/validate */
router.post("/validate", protect, async (req, res) => {
  try {
    const { code, cartTotal, shopId } = req.body;
    if (!code) return res.status(400).json({ message: "Promo code required" });

    const promo = await Promo.findOne({ code: code.toUpperCase().trim(), isActive: true });
    if (!promo) return res.status(404).json({ message: "Invalid promo code" });

    const now = new Date();
    if (promo.validUntil && promo.validUntil < now) return res.status(400).json({ message: "Promo code expired" });
    if (promo.validFrom && promo.validFrom > now) return res.status(400).json({ message: "Promo not active yet" });
    if (promo.usageLimit && promo.usedCount >= promo.usageLimit) return res.status(400).json({ message: "Promo code exhausted" });
    if (cartTotal < promo.minOrder) return res.status(400).json({ message: `Minimum order ₹${promo.minOrder} required` });

    // Check per-user limit
    const userUses = await Order.countDocuments({ user: req.user._id, promoCode: promo.code });
    if (userUses >= promo.perUserLimit) return res.status(400).json({ message: "You have already used this code" });

    // Check new user only
    if (promo.forNewUsers) {
      const orderCount = await Order.countDocuments({ user: req.user._id });
      if (orderCount > 0) return res.status(400).json({ message: "This code is for new users only" });
    }

    // Calculate discount
    let discount = 0;
    if (promo.type === "percent") {
      discount = Math.round(cartTotal * promo.value / 100);
      if (promo.maxDiscount) discount = Math.min(discount, promo.maxDiscount);
    } else if (promo.type === "flat") {
      discount = promo.value;
    } else if (promo.type === "free_delivery") {
      discount = 0; // handled in checkout
    }

    res.json({ success: true, promo: { code: promo.code, type: promo.type, value: promo.value, discount, description: promo.description, freeDelivery: promo.type === "free_delivery" } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* GET /api/promo/available */
router.get("/available", protect, async (req, res) => {
  try {
    const now = new Date();
    const promos = await Promo.find({
      isActive: true,
      $or: [{ validUntil: null }, { validUntil: { $gt: now } }],
      $or: [{ validFrom: null }, { validFrom: { $lte: now } }]
    }).select("-__v").limit(20);
    res.json({ success: true, promos });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
