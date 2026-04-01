"use strict";
require("dotenv").config();
const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors     = require("cors");
const helmet   = require("helmet");
const morgan   = require("morgan");
const rateLimit = require("express-rate-limit");

const app    = express();
const server = http.createServer(app);

/* ── SOCKET.IO ─────────────────────────────────────────────── */
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || "*", methods: ["GET","POST"] }
});
global.io = io;
io.on("connection", socket => {
  socket.on("join_order",  id => socket.join(`order_${id}`));
  socket.on("join_shop",   id => socket.join(`shop_${id}`));
  socket.on("driver_location", ({ orderId, lat, lng }) => io.to(`order_${orderId}`).emit("location_update", { lat, lng }));
});

/* ── MIDDLEWARE ────────────────────────────────────────────── */
app.use(helmet({ contentSecurityPolicy:false }));
app.use(cors({ origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL, /\.nearzy\.in$/] : "*", credentials:true }));
app.use(express.json({ limit:"15mb" }));
app.use(express.urlencoded({ extended:true, limit:"15mb" }));
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));

/* ── RATE LIMITING ─────────────────────────────────────────── */
app.use("/api", rateLimit({ windowMs:15*60*1000, max:300, message:{ error:"Too many requests" } }));
app.use("/api/auth", rateLimit({ windowMs:15*60*1000, max:20, message:{ error:"Too many auth attempts" } }));

/* ── ROUTES ────────────────────────────────────────────────── */
app.use("/api/auth",          require("./routes/auth"));
app.use("/api/shops",         require("./routes/shops"));
app.use("/api/products",      require("./routes/products"));
app.use("/api/orders",        require("./routes/orders"));
app.use("/api/payment",       require("./routes/payment"));
app.use("/api/wallet",        require("./routes/wallet"));
app.use("/api/reviews",       require("./routes/reviews"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/search",        require("./routes/search"));
app.use("/api/delivery",      require("./routes/delivery"));
app.use("/api/admin",         require("./routes/admin"));
app.use("/api/upload",        require("./routes/upload"));
app.use("/api/promo",         require("./routes/promo"));
app.use("/api/subscription",  require("./routes/subscription"));
app.use("/api/referral",      require("./routes/referral"));
app.use("/api/bookings",      require("./routes/bookings"));
app.use("/api/ai",            require("./routes/ai"));
app.use("/api/support",       require("./routes/support"));
app.use("/api/promotions",    require("./routes/promotions"));

/* ── Add users route for profile updates ──────────────────── */
const usersRouter = require("express").Router();
const authMW = require("./middleware/auth");
usersRouter.get("/me", authMW, async (req,res) => {
  try {
    const mongoose = require("mongoose");
    const User = mongoose.models.User;
    const user = User ? await User.findById(req.user._id||req.user.id).select("-password") : req.user;
    res.json(user||req.user);
  } catch(e) { res.json(req.user); }
});
usersRouter.put("/me", authMW, async (req,res) => {
  try {
    const mongoose = require("mongoose");
    const User = mongoose.models.User;
    if (User) { const u = await User.findByIdAndUpdate(req.user._id||req.user.id, req.body, {new:true}).select("-password"); res.json(u); }
    else res.json(req.user);
  } catch(e) { res.status(500).json({ error:e.message }); }
});
usersRouter.post("/me/addresses", authMW, async (req,res) => {
  try {
    const mongoose = require("mongoose");
    const User = mongoose.models.User;
    if (User) {
      const u = await User.findByIdAndUpdate(req.user._id||req.user.id, { $push:{ addresses:req.body } }, {new:true}).select("-password");
      res.json(u);
    } else res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});
usersRouter.delete("/me/addresses/:id", authMW, async (req,res) => {
  try {
    const mongoose = require("mongoose");
    const User = mongoose.models.User;
    if (User) await User.findByIdAndUpdate(req.user._id||req.user.id, { $pull:{ addresses:{ _id:req.params.id } } });
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});
app.use("/api/users", usersRouter);

/* ── HEALTH ────────────────────────────────────────────────── */
app.get("/",      (req,res) => res.json({ status:"🟢 Nearzy API Running", version:"2.0.0", timestamp:new Date().toISOString() }));
app.get("/health",(req,res) => res.json({ status:"ok" }));

/* ── 404 ───────────────────────────────────────────────────── */
app.use((req,res) => res.status(404).json({ error:"Route not found" }));

/* ── ERROR ─────────────────────────────────────────────────── */
app.use((err,req,res,next) => { console.error(err.stack); res.status(err.status||500).json({ error:err.message||"Internal server error" }); });

/* ── MONGODB + START ───────────────────────────────────────── */
mongoose.connect(process.env.MONGO_URI||"mongodb://localhost:27017/nearzy", {
  useNewUrlParser:true, useUnifiedTopology:true
}).then(() => {
  console.log("✅ MongoDB connected");
  const PORT = process.env.PORT||5000;
  server.listen(PORT, () => console.log(`🚀 Nearzy API running on port ${PORT}`));
}).catch(err => { console.error("❌ MongoDB error:", err.message); process.exit(1); });

module.exports = { app, io };