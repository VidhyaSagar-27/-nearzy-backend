const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  name: String, price: Number,
  quantity: { type: Number, default: 1 },
  image: String
});

const trackingSchema = new mongoose.Schema({
  status: String,
  message: String,
  time: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: "Shop" },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  commission: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ["COD", "ONLINE", "UPI"], default: "COD" },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
  paymentId: String,
  razorpayOrderId: String,
  orderStatus: {
    type: String,
    enum: ["placed", "confirmed", "preparing", "ready", "picked", "delivered", "cancelled"],
    default: "placed"
  },
  deliveryPartner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  deliveryAddress: {
    name: String, phone: String,
    address: String, city: String,
    pincode: String, lat: Number, lng: Number
  },
  tracking: [trackingSchema],
  notes: { type: String, default: "" },
  estimatedTime: { type: Number, default: 45 },
  deliveredAt: Date,
  cancelReason: String
}, { timestamps: true });

orderSchema.pre("save", function(next) {
  if (!this.orderNumber) {
    this.orderNumber = "NRZ" + Date.now().toString().slice(-8);
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);