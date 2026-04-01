"use strict";
const router   = require("express").Router();
const auth     = require("../middleware/auth");
const { requireRole } = require("../middleware/auth");
const mongoose = require("mongoose");

const shopSchema = new mongoose.Schema({
  name:         { type:String, required:true, trim:true },
  owner:        { type:mongoose.Types.ObjectId, ref:"User" },
  category:     { type:String, required:true, lowercase:true },
  description:  String,
  logo:         String,
  banner:       String,
  address:      { street:String, city:String, state:String, pincode:String, lat:Number, lng:Number },
  city:         String,
  phone:        String,
  email:        String,
  isOpen:       { type:Boolean, default:true },
  isApproved:   { type:Boolean, default:false },
  isSuspended:  { type:Boolean, default:false },
  rating:       { type:Number, default:4.0, min:0, max:5 },
  ratingCount:  { type:Number, default:0 },
  deliveryTime: { type:Number, default:30 },
  deliveryFee:  { type:Number, default:49 },
  minOrder:     { type:Number, default:0 },
  tags:         [String],
  openHours:    String,
  createdAt:    { type:Date, default:Date.now }
});
shopSchema.index({ city:1, category:1, isApproved:1 });
shopSchema.index({ name:"text", category:"text" });
const Shop = mongoose.models.Shop || mongoose.model("Shop", shopSchema);

/* GET /api/shops */
router.get("/", async (req,res) => {
  try {
    const { city, category, limit=100, page=1, q, open } = req.query;
    const filter = { isSuspended:{$ne:true} };
    // Show approved OR recently created (so sellers see their shop)
    filter.$or = [{ isApproved:true }, { createdAt:{ $gte:new Date(Date.now()-7*86400000) } }];
    if (city)     filter.$or = [{ city:new RegExp(city,"i") }, { "address.city":new RegExp(city,"i") }];
    if (category && category!=="all") filter.category = category;
    if (open==="true") filter.isOpen = true;
    if (q) filter.$text = { $search:q };
    const shops = await Shop.find(filter).sort({ isApproved:-1, rating:-1, createdAt:-1 }).limit(parseInt(limit)).skip((parseInt(page)-1)*parseInt(limit));
    res.json(shops);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* GET /api/shops/:id */
router.get("/:id", async (req,res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error:"Shop not found" });
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ error:"Shop not found" });
    res.json(shop);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* POST /api/shops — Create shop (seller) */
router.post("/", auth, async (req,res) => {
  try {
    const uid = req.user._id||req.user.id;
    const existing = await Shop.findOne({ owner:uid });
    if (existing) return res.status(400).json({ error:"You already have a shop registered" });
    const shop = await Shop.create({ ...req.body, owner:uid, isApproved:false });
    // Update user role to seller
    try {
      const { User } = require("./auth");
      await User.findByIdAndUpdate(uid, { role:"seller" });
    } catch(e) {}
    res.status(201).json(shop);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* GET /api/shops/seller/my-shop */
router.get("/seller/my-shop", auth, async (req,res) => {
  try {
    const shop = await Shop.findOne({ owner:req.user._id||req.user.id });
    if (!shop) return res.status(404).json({ error:"No shop found. Please create a shop first." });
    res.json(shop);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* POST /api/shops/seller/toggle-status */
router.post("/seller/toggle-status", auth, async (req,res) => {
  try {
    const shop = await Shop.findOne({ owner:req.user._id||req.user.id });
    if (!shop) return res.status(404).json({ error:"Shop not found" });
    shop.isOpen = !shop.isOpen;
    await shop.save();
    res.json({ isOpen:shop.isOpen });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* GET /api/shops/admin/all */
router.get("/admin/all", auth, async (req,res) => {
  try {
    const shops = await Shop.find({}).sort({ createdAt:-1 }).limit(200).populate("owner","name email");
    res.json(shops);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* PUT /api/shops/admin/approve/:id */
router.put("/admin/approve/:id", auth, async (req,res) => {
  try {
    const shop = await Shop.findByIdAndUpdate(req.params.id, { isApproved:true, isSuspended:false }, {new:true});
    res.json({ success:true, shop });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* PUT /api/shops/admin/suspend/:id */
router.put("/admin/suspend/:id", auth, async (req,res) => {
  try {
    const shop = await Shop.findByIdAndUpdate(req.params.id, { isSuspended:true, isOpen:false }, {new:true});
    res.json({ success:true, shop });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* PUT /api/shops/:id — Update shop */
router.put("/:id", auth, async (req,res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ error:"Shop not found" });
    const uid = String(req.user._id||req.user.id);
    if (String(shop.owner)!==uid && !["admin","superadmin"].includes(req.user.role)) return res.status(403).json({ error:"Not authorized" });
    const updated = await Shop.findByIdAndUpdate(req.params.id, req.body, {new:true});
    res.json(updated);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

module.exports = router;
module.exports.Shop = Shop;