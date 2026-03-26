"use strict";
const router = require("express").Router();
const { protect } = require("../middleware/auth");
const { Booking, Shop } = require("../models");

/* POST /api/bookings */
router.post("/", protect, async (req, res) => {
  try {
    const { shopId, date, time, guests, notes } = req.body;
    if (!shopId || !date || !time || !guests) return res.status(400).json({ message: "Missing required fields" });

    const shop = await Shop.findById(shopId);
    if (!shop) return res.status(404).json({ message: "Shop not found" });

    const booking = await Booking.create({
      user: req.user._id, shop: shopId, date, time, guests: parseInt(guests), notes
    });

    res.status(201).json({ success: true, booking: { ...booking.toObject(), shopName: shop.name } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* GET /api/bookings/my */
router.get("/my", protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user._id })
      .populate("shop", "name address images").sort({ createdAt: -1 });
    res.json({ success: true, bookings });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* DELETE /api/bookings/:id */
router.delete("/:id", protect, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    booking.status = "cancelled";
    await booking.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
