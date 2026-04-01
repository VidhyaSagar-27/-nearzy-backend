"use strict";
const router   = require("express").Router();
const auth     = require("../middleware/auth");
const mongoose = require("mongoose");

const notifSchema = new mongoose.Schema({
  user:    { type:mongoose.Types.ObjectId, ref:"User", required:true, index:true },
  title:   { type:String, required:true },
  body:    String,
  type:    { type:String, enum:["order","payment","delivery","promo","system","wallet","success","info","error"], default:"system" },
  isRead:  { type:Boolean, default:false },
  data:    mongoose.Schema.Types.Mixed,
  createdAt:{ type:Date, default:Date.now }
});
const Notification = mongoose.models.Notification || mongoose.model("Notification", notifSchema);

/* GET /api/notifications */
router.get("/", auth, async (req,res) => {
  try {
    const notifs = await Notification.find({ user:req.user._id||req.user.id }).sort({ createdAt:-1 }).limit(50);
    res.json({ notifications: notifs });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* PUT /api/notifications/:id/read */
router.put("/:id/read", auth, async (req,res) => {
  try {
    await Notification.findOneAndUpdate({ _id:req.params.id, user:req.user._id||req.user.id }, { isRead:true });
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* PUT /api/notifications/read-all */
router.put("/read-all", auth, async (req,res) => {
  try {
    await Notification.updateMany({ user:req.user._id||req.user.id, isRead:false }, { isRead:true });
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* Helper to create a notification (used by other routes) */
async function createNotification(userId, title, body, type="system", data=null) {
  try { await Notification.create({ user:userId, title, body, type, data }); } catch(e) {}
}

module.exports = router;
module.exports.createNotification = createNotification;