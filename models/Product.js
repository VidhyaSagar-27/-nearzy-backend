const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: String,
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: String
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  price: { type: Number, required: true, min: 0 },
  originalPrice: { type: Number, default: 0 },
  images: [String],
  category: { type: String, default: "General" },
  tags: [String],
  unit: { type: String, default: "piece" },
  stock: { type: Number, default: 10, min: 0 },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: "Shop", required: true },
  reviews: [reviewSchema],
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  preparationTime: { type: Number, default: 15 }
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);