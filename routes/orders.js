"use strict";
const router   = require("express").Router();
const auth     = require("../middleware/auth");
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderNumber:     { type:String, unique:true },
  customer:        { type:mongoose.Types.ObjectId, ref:"User", required:true, index:true },
  shop:            { type:mongoose.Types.ObjectId, ref:"Shop" },
  items:           [{ name:String, productId:mongoose.Types.ObjectId, price:Number, quantity:Number, image:String }],
  deliveryAddress: { name:String, phone:String, address:String, city:String, pincode:String, lat:Number, lng:Number, type:String },
  orderStatus:     { type:String, enum:["placed","confirmed","preparing","ready","picked","on_the_way","delivered","cancelled"], default:"placed" },
  paymentMethod:   { type:String, enum:["razorpay","wallet","cod","upi"], default:"razorpay" },
  paymentStatus:   { type:String, enum:["pending","paid","failed","refunded"], default:"pending" },
  paymentId:       String,
  subtotal:        Number,
  deliveryFee:     { type:Number, default:0 },
  discount:        { type:Number, default:0 },
  promoDiscount:   { type:Number, default:0 },
  totalAmount:     { type:Number, required:true },
  promoCode:       String,
  scheduledTime:   Date,
  specialInstructions: String,
  rating:          Number,
  review:          String,
  deliveryPartner: { type:mongoose.Types.ObjectId, ref:"User" },
  estimatedTime:   { type:Number, default:30 },
  createdAt:       { type:Date, default:Date.now },
  updatedAt:       { type:Date, default:Date.now }
});
orderSchema.index({ customer:1, createdAt:-1 });
orderSchema.index({ shop:1, orderStatus:1 });

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

function genOrderNumber() { return "NRZ"+Date.now().toString(36).toUpperCase()+Math.random().toString(36).substring(2,5).toUpperCase(); }

/* POST /api/orders — Place order */
router.post("/", auth, async (req,res) => {
  try {
    const uid = req.user._id||req.user.id;
    const { items, shopId, deliveryAddress, paymentMethod, paymentId, totalAmount, subtotal, deliveryFee, discount, promoDiscount, promoCode, specialInstructions, scheduledTime } = req.body;
    if (!items?.length||!totalAmount) return res.status(400).json({ error:"Items and amount required" });
    const order = await Order.create({ orderNumber:genOrderNumber(), customer:uid, shop:shopId, items, deliveryAddress, paymentMethod:paymentMethod||"razorpay", paymentId, paymentStatus:paymentId?"paid":"pending", totalAmount, subtotal, deliveryFee, discount, promoDiscount, promoCode, specialInstructions, scheduledTime, estimatedTime:30 });
    // Emit socket event
    if (global.io && shopId) global.io.to(`shop_${shopId}`).emit("new_order", { orderId:order._id, orderNumber:order.orderNumber });
    // Update product soldCount
    try {
      const { Product } = require("./products");
      for (const item of items) {
        if (item.productId) await Product.findByIdAndUpdate(item.productId, { $inc:{ soldCount:item.quantity||1 } });
      }
    } catch(e) {}
    res.status(201).json(order);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* GET /api/orders/my-orders */
router.get("/my-orders", auth, async (req,res) => {
  try {
    const orders = await Order.find({ customer:req.user._id||req.user.id }).sort({ createdAt:-1 }).limit(50).populate("shop","name logo category");
    res.json(orders);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* GET /api/orders/shop-orders — for sellers */
router.get("/shop-orders", auth, async (req,res) => {
  try {
    const { Shop } = require("./shops");
    const shop = await Shop.findOne({ owner:req.user._id||req.user.id });
    if (!shop) return res.json([]);
    const orders = await Order.find({ shop:shop._id }).sort({ createdAt:-1 }).limit(100).populate("customer","name phone");
    res.json(orders);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* GET /api/orders/delivery-orders — for delivery partners */
router.get("/delivery-orders", auth, async (req,res) => {
  try {
    const myOrders    = await Order.find({ deliveryPartner:req.user._id||req.user.id, orderStatus:{ $in:["picked","on_the_way"] } }).sort({ createdAt:-1 }).limit(20).populate("shop","name address").populate("customer","name phone");
    const available   = await Order.find({ orderStatus:"ready", deliveryPartner:{ $exists:false } }).sort({ createdAt:-1 }).limit(15).populate("shop","name address");
    res.json({ myOrders, available });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* GET /api/orders/:id */
router.get("/:id", auth, async (req,res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error:"Order not found" });
    const order = await Order.findById(req.params.id).populate("shop","name logo address phone").populate("customer","name phone");
    if (!order) return res.status(404).json({ error:"Order not found" });
    res.json(order);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* PUT /api/orders/:id/status — update status */
router.put("/:id/status", auth, async (req,res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { orderStatus:status, updatedAt:new Date() }, {new:true});
    if (global.io) global.io.to(`order_${order._id}`).emit("order_status", { status });
    res.json(order);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* PUT /api/orders/:id/cancel */
router.put("/:id/cancel", auth, async (req,res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error:"Order not found" });
    if (!["placed","confirmed"].includes(order.orderStatus)) return res.status(400).json({ error:"Cannot cancel order at this stage" });
    await Order.findByIdAndUpdate(req.params.id, { orderStatus:"cancelled", updatedAt:new Date() });
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

module.exports = router;
module.exports.Order = Order;