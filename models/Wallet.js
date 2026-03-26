const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  type: { type: String, enum: ["credit", "debit"], required: true },
  amount: { type: Number, required: true },
  description: { type: String, default: "" },
  reference: { type: String, default: "" }, // orderId or razorpay paymentId
  balanceAfter: { type: Number, default: 0 },
  status: { type: String, enum: ["pending", "success", "failed"], default: "success" }
}, { timestamps: true });

const walletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  balance: { type: Number, default: 0, min: 0 },
  transactions: [transactionSchema],
  totalCredited: { type: Number, default: 0 },
  totalDebited: { type: Number, default: 0 }
}, { timestamps: true });

// Helper method to add money
walletSchema.methods.credit = async function(amount, description, reference) {
  this.balance += amount;
  this.totalCredited += amount;
  this.transactions.push({
    type: "credit", amount, description,
    reference: reference || "", balanceAfter: this.balance
  });
  return this.save();
};

// Helper method to deduct money
walletSchema.methods.debit = async function(amount, description, reference) {
  if (this.balance < amount) throw new Error("Insufficient wallet balance");
  this.balance -= amount;
  this.totalDebited += amount;
  this.transactions.push({
    type: "debit", amount, description,
    reference: reference || "", balanceAfter: this.balance
  });
  return this.save();
};

module.exports = mongoose.model("Wallet", walletSchema);
