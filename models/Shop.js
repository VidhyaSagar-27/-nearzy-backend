const mongoose = require("mongoose");

const shopSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  description: { type: String, default: "" },
  category: {
    type: String,
    enum: [
      "restaurant", "bakery", "grocery", "flowers", "pharmacy",
      "electronics", "clothing", "hardware", "hotel", "fruits",
      "vegetables", "sweets", "stationery", "salon", "laundry",
      "meat", "dairy", "sports", "toys", "books", "general"
    ],
    default: "general"
  },
  logo: { type: String, default: "" },
  banner: { type: String, default: "" },
  images: [String],
  address: {
    street: String, city: String, state: String,
    pincode: String, lat: Number, lng: Number
  },
  phone: { type: String, default: "" },
  email: { type: String, default: "" },
  timing: {
    open: { type: String, default: "09:00" },
    close: { type: String, default: "21:00" },
    days: { type: [String], default: ["Mon","Tue","Wed","Thu","Fri","Sat"] }
  },
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  deliveryTime: { type: Number, default: 30 },
  minOrder: { type: Number, default: 0 },
  deliveryFee: { type: Number, default: 49 },
  freeDeliveryAbove: { type: Number, default: 299 },
  isOpen: { type: Boolean, default: true },
  isApproved: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  city: { type: String, default: "" },
  commission: { type: Number, default: 10 },
  totalOrders: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("Shop", shopSchema);