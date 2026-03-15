const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" }, quantity: { type: Number, default: 1 } }]
}, { timestamps: true });
const Cart = mongoose.model("Cart", cartSchema);

const wishlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }]
}, { timestamps: true });
const Wishlist = mongoose.model("Wishlist", wishlistSchema);

module.exports = { Cart, Wishlist };