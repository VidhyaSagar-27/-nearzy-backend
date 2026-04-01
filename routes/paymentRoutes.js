"use strict";
const router = require("express").Router();
const auth   = require("../middleware/auth");
const crypto = require("crypto");

/* POST /api/payment/create-order */
router.post("/create-order", auth, async (req, res) => {
  try {
    const Razorpay = require("razorpay");
    const rzp = new Razorpay({ key_id:process.env.RAZORPAY_KEY_ID, key_secret:process.env.RAZORPAY_KEY_SECRET });
    const { amount, currency="INR", notes={} } = req.body;
    if (!amount||amount<1) return res.status(400).json({ error:"Invalid amount" });
    const order = await rzp.orders.create({ amount:Math.round(amount*100), currency, notes:{ ...notes, userId:String(req.user._id||req.user.id) } });
    res.json({ order });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* POST /api/payment/verify */
router.post("/verify", auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_payment_id) return res.status(400).json({ error:"Payment ID required" });
    if (razorpay_order_id && razorpay_signature) {
      const hmac   = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET||"");
      hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
      const digest = hmac.digest("hex");
      if (digest !== razorpay_signature) return res.status(400).json({ error:"Payment verification failed — invalid signature" });
    }
    res.json({ success:true, paymentId:razorpay_payment_id });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

module.exports = router;