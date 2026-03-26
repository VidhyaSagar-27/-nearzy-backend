const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  type: {
    type: String,
    enum: ["order", "payment", "delivery", "promo", "system", "wallet"],
    default: "system"
  },
  data: { type: mongoose.Schema.Types.Mixed, default: {} }, // e.g. { orderId, shopId }
  isRead: { type: Boolean, default: false },
  readAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
