const mongoose = require("mongoose");

const commissionSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: "Shop", required: true },
  orderAmount: { type: Number, required: true },
  commissionRate: { type: Number, required: true },
  commissionAmount: { type: Number, required: true },
  shopEarning: { type: Number, required: true },
  status: { type: String, enum: ["pending", "paid", "cancelled"], default: "pending" },
  paidAt: Date
}, { timestamps: true });

module.exports = mongoose.model("Commission", commissionSchema);