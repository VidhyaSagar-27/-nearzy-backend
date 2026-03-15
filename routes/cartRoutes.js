const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");

// Simple in-DB cart using User model
const { Cart, Wishlist } = require("../models/CartWishlist");

// GET CART
router.get("/", auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id }).populate("items.product");
    res.json(cart || { items: [] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADD TO CART
router.post("/add", auth, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) cart = new Cart({ user: req.user.id, items: [] });
    const existing = cart.items.find(i => i.product.toString() === productId);
    if (existing) existing.quantity += quantity || 1;
    else cart.items.push({ product: productId, quantity: quantity || 1 });
    await cart.save();
    res.json(cart);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// UPDATE QUANTITY
router.put("/update", auth, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) return res.status(404).json({ message: "Cart not found" });
    if (quantity <= 0) cart.items = cart.items.filter(i => i.product.toString() !== productId);
    else { const item = cart.items.find(i => i.product.toString() === productId); if (item) item.quantity = quantity; }
    await cart.save();
    res.json(cart);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// CLEAR CART
router.delete("/clear", auth, async (req, res) => {
  try {
    await Cart.findOneAndUpdate({ user: req.user.id }, { items: [] });
    res.json({ message: "Cart cleared" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;