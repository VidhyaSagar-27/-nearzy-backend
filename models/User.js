const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["customer", "seller", "delivery", "admin", "superadmin"],
    default: "customer"
  },
  avatar: { type: String, default: "" },
  address: {
    street: String, city: String, state: String,
    pincode: String, lat: Number, lng: Number
  },
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: "Shop" },
  city: { type: String, default: "" },
  deviceToken: { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);