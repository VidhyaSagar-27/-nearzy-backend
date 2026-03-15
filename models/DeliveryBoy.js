const mongoose = require("mongoose");

const deliverySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  vehicleType: { type: String, enum: ["bike", "scooter", "cycle", "auto"], default: "bike" },
  vehicleNumber: { type: String, default: "" },
  licenseNumber: { type: String, default: "" },
  isAvailable: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  currentLocation: { lat: Number, lng: Number },
  activeOrder: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  city: { type: String, default: "" },
  totalDeliveries: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("DeliveryBoy", deliverySchema);