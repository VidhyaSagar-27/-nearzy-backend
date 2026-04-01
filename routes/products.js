"use strict";
const router   = require("express").Router();
const auth     = require("../middleware/auth");
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name:          { type:String, required:true, trim:true },
  shop:          { type:mongoose.Types.ObjectId, ref:"Shop", required:true },
  category:      { type:String, required:true, lowercase:true },
  price:         { type:Number, required:true, min:0 },
  originalPrice: { type:Number, default:0 },
  stock:         { type:Number, default:10, min:0 },
  unit:          { type:String, default:"piece" },
  description:   String,
  images:        [String],
  isAvailable:   { type:Boolean, default:true },
  rating:        { type:Number, default:4.0 },
  ratingCount:   { type:Number, default:0 },
  soldCount:     { type:Number, default:0 },
  tags:          [String],
  createdAt:     { type:Date, default:Date.now }
});
productSchema.index({ shop:1, category:1 });
productSchema.index({ name:"text", description:"text" });
const Product = mongoose.models.Product || mongoose.model("Product", productSchema);

/* GET /api/products */
router.get("/", async (req,res) => {
  try {
    const { shop, category, limit=100, page=1, q } = req.query;
    const filter = { isAvailable:true };
    if (shop)     filter.shop     = shop;
    if (category) filter.category = category;
    if (q)        filter.$text    = { $search:q };
    const products = await Product.find(filter).populate("shop","name category city deliveryTime deliveryFee isOpen").sort({ soldCount:-1, createdAt:-1 }).limit(parseInt(limit)).skip((parseInt(page)-1)*parseInt(limit));
    res.json(products);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* GET /api/products/my-products — seller's products */
router.get("/my-products", auth, async (req,res) => {
  try {
    const { Shop } = require("./shops");
    const shop = await Shop.findOne({ owner:req.user._id||req.user.id });
    if (!shop) return res.json([]);
    const products = await Product.find({ shop:shop._id }).sort({ createdAt:-1 });
    res.json(products);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* GET /api/products/:id */
router.get("/:id", async (req,res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error:"Product not found" });
    const p = await Product.findById(req.params.id).populate("shop","name category city deliveryTime deliveryFee isOpen logo");
    if (!p) return res.status(404).json({ error:"Product not found" });
    res.json(p);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* POST /api/products — Add product (seller only) */
router.post("/", auth, async (req,res) => {
  try {
    if (!["seller","admin","superadmin"].includes(req.user.role)) return res.status(403).json({ error:"Sellers only" });
    const { Shop } = require("./shops");
    const shop = await Shop.findOne({ owner:req.user._id||req.user.id });
    if (!shop) return res.status(404).json({ error:"Create your shop first" });
    const product = await Product.create({ ...req.body, shop:shop._id });
    res.status(201).json(product);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* PUT /api/products/:id */
router.put("/:id", auth, async (req,res) => {
  try {
    if (!["seller","admin","superadmin"].includes(req.user.role)) return res.status(403).json({ error:"Sellers only" });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error:"Product not found" });
    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, {new:true});
    res.json(updated);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* DELETE /api/products/:id */
router.delete("/:id", auth, async (req,res) => {
  try {
    if (!["seller","admin","superadmin"].includes(req.user.role)) return res.status(403).json({ error:"Sellers only" });
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

module.exports = router;
module.exports.Product = Product;