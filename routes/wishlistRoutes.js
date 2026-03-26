const express = require("express");
const router = express.Router();
const { Wishlist } = require("../models/CartWishlist");
const { auth } = require("../middleware/auth");

// GET WISHLIST
router.get("/", auth, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id })
      .populate("products", "name price images rating shop isActive");
    res.json(wishlist || { products: [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ADD TO WISHLIST
router.post("/add", auth, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ message: "productId required" });
    let wishlist = await Wishlist.findOne({ user: req.user.id });
    if (!wishlist) wishlist = new Wishlist({ user: req.user.id, products: [] });
    if (wishlist.products.map(p => p.toString()).includes(productId)) {
      return res.status(400).json({ message: "Already in wishlist" });
    }
    wishlist.products.push(productId);
    await wishlist.save();
    res.json({ message: "Added to wishlist", wishlist });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// REMOVE FROM WISHLIST
router.delete("/remove/:productId", auth, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id });
    if (!wishlist) return res.status(404).json({ message: "Wishlist not found" });
    wishlist.products = wishlist.products.filter(p => p.toString() !== req.params.productId);
    await wishlist.save();
    res.json({ message: "Removed from wishlist" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// TOGGLE WISHLIST (add if not present, remove if present)
router.post("/toggle", auth, async (req, res) => {
  try {
    const { productId } = req.body;
    let wishlist = await Wishlist.findOne({ user: req.user.id });
    if (!wishlist) wishlist = new Wishlist({ user: req.user.id, products: [] });
    const idx = wishlist.products.map(p => p.toString()).indexOf(productId);
    if (idx > -1) {
      wishlist.products.splice(idx, 1);
      await wishlist.save();
      return res.json({ message: "Removed from wishlist", inWishlist: false });
    } else {
      wishlist.products.push(productId);
      await wishlist.save();
      return res.json({ message: "Added to wishlist", inWishlist: true });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
