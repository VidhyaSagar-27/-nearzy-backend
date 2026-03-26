"use strict";
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/* ══════════════════════════════════════════════════════════
   USER MODEL
══════════════════════════════════════════════════════════ */
const userSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  phone:         { type: String, unique: true, sparse: true, trim: true },
  password:      { type: String, select: false },
  avatar:        { type: String, default: "" },
  role:          { type: String, enum: ["user","shop_owner","delivery","admin"], default: "user" },
  city:          { type: String, default: "Ramagundam" },
  addresses:     [{
    label:       String,
    line1:       String,
    line2:       String,
    city:        String,
    pincode:     String,
    lat:         Number,
    lng:         Number,
    isDefault:   { type: Boolean, default: false }
  }],
  wallet: {
    balance:       { type: Number, default: 0 },
    totalCredited: { type: Number, default: 0 },
    totalDebited:  { type: Number, default: 0 }
  },
  loyalty: {
    points:   { type: Number, default: 0 },
    tier:     { type: String, default: "Bronze" },
    lifetime: { type: Number, default: 0 }
  },
  subscription: {
    active:  { type: Boolean, default: false },
    plan:    { type: String, enum: ["monthly","yearly",null], default: null },
    expiry:  Date,
    startedAt: Date
  },
  referralCode:  { type: String, unique: true, sparse: true },
  referredBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  referralCount: { type: Number, default: 0 },
  referralEarned:{ type: Number, default: 0 },
  fcmToken:      String,
  pushSubscription: Object,
  otp:           { code: String, expiry: Date },
  isVerified:    { type: Boolean, default: false },
  isActive:      { type: Boolean, default: true },
  lastLogin:     Date,
  birthday:      Date,
  preferences: {
    notifications: { type: Boolean, default: true },
    darkMode:      { type: Boolean, default: false },
    language:      { type: String, default: "en" }
  }
}, { timestamps: true });

userSchema.pre("save", async function(next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.comparePassword = function(candidate) {
  return bcrypt.compare(candidate, this.password);
};
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.otp;
  return obj;
};

/* ══════════════════════════════════════════════════════════
   SHOP MODEL
══════════════════════════════════════════════════════════ */
const shopSchema = new mongoose.Schema({
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name:        { type: String, required: true, trim: true },
  description: String,
  category:    { type: String, required: true, enum: ["restaurant","grocery","pharmacy","flower","bakery","electronics","fashion","pet","salon","other"] },
  images:      [String],
  logo:        String,
  address: {
    line1:  String,
    line2:  String,
    city:   { type: String, required: true },
    state:  String,
    pincode:String,
    lat:    Number,
    lng:    Number
  },
  contact: {
    phone:    String,
    email:    String,
    whatsapp: String
  },
  timing: {
    open:    { type: String, default: "09:00" },
    close:   { type: String, default: "22:00" },
    days:    { type: [String], default: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] },
    isOpen:  { type: Boolean, default: true }
  },
  delivery: {
    minOrder:    { type: Number, default: 0 },
    charge:      { type: Number, default: 40 },
    freeAbove:   { type: Number, default: 299 },
    radius:      { type: Number, default: 5 },
    avgTime:     { type: Number, default: 30 },
    available:   { type: Boolean, default: true }
  },
  rating:       { type: Number, default: 4.2, min: 0, max: 5 },
  totalRatings: { type: Number, default: 0 },
  totalOrders:  { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  isVerified:   { type: Boolean, default: false },
  isActive:     { type: Boolean, default: true },
  isFeatured:   { type: Boolean, default: false },
  tags:         [String],
  cuisine:      [String],
  amenities:    { tableBooking: Boolean, parking: Boolean, ac: Boolean, outdoor: Boolean },
  bankDetails: {
    accountName:   String,
    accountNumber: String,
    ifsc:          String,
    upiId:         String
  },
  commissionRate: { type: Number, default: 15 }
}, { timestamps: true });

shopSchema.index({ "address.city": 1, category: 1, isActive: 1 });
shopSchema.index({ name: "text", description: "text", tags: "text" });

/* ══════════════════════════════════════════════════════════
   PRODUCT MODEL
══════════════════════════════════════════════════════════ */
const productSchema = new mongoose.Schema({
  shop:        { type: mongoose.Schema.Types.ObjectId, ref: "Shop", required: true },
  name:        { type: String, required: true, trim: true },
  description: String,
  category:    String,
  subCategory: String,
  images:      [String],
  price:       { type: Number, required: true, min: 0 },
  mrp:         Number,
  discount:    { type: Number, default: 0 },
  unit:        { type: String, default: "piece" },
  stock:       { type: Number, default: 999 },
  isVeg:       { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
  isPopular:   { type: Boolean, default: false },
  isBestSeller:{ type: Boolean, default: false },
  isFlashDeal: { type: Boolean, default: false },
  flashPrice:  Number,
  flashExpiry: Date,
  tags:        [String],
  nutritionInfo: {
    calories:     Number,
    protein:      Number,
    carbs:        Number,
    fat:          Number,
    fiber:        Number
  },
  allergens:   [String],
  preparationTime: Number,
  rating:       { type: Number, default: 0 },
  totalRatings: { type: Number, default: 0 },
  totalSold:    { type: Number, default: 0 }
}, { timestamps: true });

productSchema.index({ shop: 1, isAvailable: 1 });
productSchema.index({ name: "text", description: "text", tags: "text" });

/* ══════════════════════════════════════════════════════════
   ORDER MODEL
══════════════════════════════════════════════════════════ */
const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  shop:        { type: mongoose.Schema.Types.ObjectId, ref: "Shop", required: true },
  items: [{
    product:  { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name:     String,
    price:    Number,
    qty:      Number,
    image:    String,
    isFlash:  Boolean
  }],
  pricing: {
    subtotal:      Number,
    deliveryCharge:{ type: Number, default: 0 },
    discount:      { type: Number, default: 0 },
    promoDiscount: { type: Number, default: 0 },
    loyaltyDiscount:{ type: Number, default: 0 },
    walletUsed:    { type: Number, default: 0 },
    gst:           { type: Number, default: 0 },
    total:         Number
  },
  payment: {
    method:    { type: String, enum: ["cod","online","wallet","upi"], default: "online" },
    status:    { type: String, enum: ["pending","paid","failed","refunded"], default: "pending" },
    razorpayOrderId:   String,
    razorpayPaymentId: String,
    paidAt:    Date
  },
  deliveryAddress: {
    label:   String,
    line1:   String,
    line2:   String,
    city:    String,
    pincode: String,
    lat:     Number,
    lng:     Number
  },
  deliveryPartner: {
    name:   String,
    phone:  String,
    avatar: String,
    vehicleNo: String
  },
  orderStatus: {
    type: String,
    enum: ["placed","confirmed","preparing","ready","picked","on_the_way","delivered","cancelled"],
    default: "placed"
  },
  statusHistory: [{
    status:    String,
    timestamp: { type: Date, default: Date.now },
    note:      String
  }],
  promoCode:     String,
  promoCodeId:   { type: mongoose.Schema.Types.ObjectId, ref: "Promo" },
  loyaltyEarned: { type: Number, default: 0 },
  scheduledFor:  Date,
  isGroupOrder:  { type: Boolean, default: false },
  groupOrderId:  String,
  isScheduled:   { type: Boolean, default: false },
  isCorporate:   { type: Boolean, default: false },
  cancellationReason: String,
  refundAmount:  { type: Number, default: 0 },
  refundStatus:  { type: String, enum: ["none","pending","processed"], default: "none" },
  rating:        Number,
  review:        String,
  reviewedAt:    Date,
  estimatedTime: Number,
  deliveredAt:   Date
}, { timestamps: true });

orderSchema.pre("save", function(next) {
  if (!this.orderNumber) {
    this.orderNumber = "NRZ" + Date.now().toString().slice(-8) + Math.random().toString(36).slice(2,5).toUpperCase();
  }
  next();
});

/* ══════════════════════════════════════════════════════════
   WALLET TRANSACTION MODEL
══════════════════════════════════════════════════════════ */
const walletTxSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type:        { type: String, enum: ["credit","debit"], required: true },
  amount:      { type: Number, required: true },
  balanceAfter:Number,
  description: String,
  category:    { type: String, enum: ["topup","order","refund","reward","referral","transfer","cashback","gift"], default: "order" },
  reference:   String,
  razorpayId:  String,
  orderId:     { type: mongoose.Schema.Types.ObjectId, ref: "Order" }
}, { timestamps: true });

/* ══════════════════════════════════════════════════════════
   REVIEW MODEL
══════════════════════════════════════════════════════════ */
const reviewSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  shop:    { type: mongoose.Schema.Types.ObjectId, ref: "Shop" },
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  order:   { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  rating:  { type: Number, required: true, min: 1, max: 5 },
  review:  String,
  tags:    [String],
  images:  [String],
  isVerified: { type: Boolean, default: true },
  helpful:    { type: Number, default: 0 },
  reply:   String,
  repliedAt: Date
}, { timestamps: true });

/* ══════════════════════════════════════════════════════════
   PROMO CODE MODEL
══════════════════════════════════════════════════════════ */
const promoSchema = new mongoose.Schema({
  code:        { type: String, required: true, unique: true, uppercase: true },
  description: String,
  type:        { type: String, enum: ["percent","flat","free_delivery","bogo"], required: true },
  value:       Number,
  minOrder:    { type: Number, default: 0 },
  maxDiscount: Number,
  usageLimit:  { type: Number, default: 1000 },
  usedCount:   { type: Number, default: 0 },
  perUserLimit:{ type: Number, default: 1 },
  validFrom:   Date,
  validUntil:  Date,
  isActive:    { type: Boolean, default: true },
  forNewUsers: { type: Boolean, default: false },
  shops:       [{ type: mongoose.Schema.Types.ObjectId, ref: "Shop" }],
  categories:  [String]
}, { timestamps: true });

/* ══════════════════════════════════════════════════════════
   NOTIFICATION MODEL
══════════════════════════════════════════════════════════ */
const notifSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title:   { type: String, required: true },
  body:    String,
  type:    { type: String, enum: ["order","payment","delivery","promo","system","wallet","loyalty"], default: "system" },
  data:    Object,
  isRead:  { type: Boolean, default: false },
  readAt:  Date
}, { timestamps: true });

/* ══════════════════════════════════════════════════════════
   TABLE BOOKING MODEL
══════════════════════════════════════════════════════════ */
const bookingSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  shop:    { type: mongoose.Schema.Types.ObjectId, ref: "Shop", required: true },
  date:    { type: String, required: true },
  time:    { type: String, required: true },
  guests:  { type: Number, required: true, min: 1, max: 20 },
  notes:   String,
  status:  { type: String, enum: ["confirmed","cancelled","completed","no_show"], default: "confirmed" },
  bookingId: { type: String, unique: true }
}, { timestamps: true });

bookingSchema.pre("save", function(next) {
  if (!this.bookingId) this.bookingId = "TB" + Date.now();
  next();
});

/* ══════════════════════════════════════════════════════════
   EXPORTS
══════════════════════════════════════════════════════════ */
const User        = mongoose.model("User",        userSchema);
const Shop        = mongoose.model("Shop",        shopSchema);
const Product     = mongoose.model("Product",     productSchema);
const Order       = mongoose.model("Order",       orderSchema);
const WalletTx    = mongoose.model("WalletTx",    walletTxSchema);
const Review      = mongoose.model("Review",      reviewSchema);
const Promo       = mongoose.model("Promo",       promoSchema);
const Notification= mongoose.model("Notification",notifSchema);
const Booking     = mongoose.model("Booking",     bookingSchema);

module.exports = { User, Shop, Product, Order, WalletTx, Review, Promo, Notification, Booking };
