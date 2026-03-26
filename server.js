"use strict";
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const server = http.createServer(app);

/* ─── SOCKET.IO ─────────────────────────────────────────── */
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || "*", methods: ["GET", "POST"] }
});
global.io = io;

io.on("connection", (socket) => {
  socket.on("join_order", (orderId) => socket.join(`order_${orderId}`));
  socket.on("join_shop", (shopId) => socket.join(`shop_${shopId}`));
  socket.on("driver_location", ({ orderId, lat, lng }) => {
    io.to(`order_${orderId}`).emit("location_update", { lat, lng });
  });
  socket.on("disconnect", () => {});
});

/* ─── MIDDLEWARE ────────────────────────────────────────── */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL, /\.nearzy\.in$/] : "*",
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));

/* ─── RATE LIMITING ─────────────────────────────────────── */
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: "Too many requests" } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many auth attempts" } });
app.use("/api", limiter);
app.use("/api/auth", authLimiter);

/* ─── ROUTES ────────────────────────────────────────────── */
app.use("/api/auth",         require("./routes/auth"));
app.use("/api/users",        require("./routes/users"));
app.use("/api/shops",        require("./routes/shops"));
app.use("/api/products",     require("./routes/products"));
app.use("/api/orders",       require("./routes/orders"));
app.use("/api/payment",      require("./routes/payment"));
app.use("/api/wallet",       require("./routes/wallet"));
app.use("/api/reviews",      require("./routes/reviews"));
app.use("/api/notifications",require("./routes/notifications"));
app.use("/api/search",       require("./routes/search"));
app.use("/api/delivery",     require("./routes/delivery"));
app.use("/api/admin",        require("./routes/admin"));
app.use("/api/upload",       require("./routes/upload"));
app.use("/api/promo",        require("./routes/promo"));
app.use("/api/subscription", require("./routes/subscription"));
app.use("/api/referral",     require("./routes/referral"));
app.use("/api/bookings",     require("./routes/bookings"));
app.use("/api/ai",           require("./routes/ai"));

/* ─── HEALTH CHECK ──────────────────────────────────────── */
app.get("/", (req, res) => res.json({
  status: "🟢 Nearzy API Running",
  version: "2.0.0",
  timestamp: new Date().toISOString()
}));
app.get("/health", (req, res) => res.json({ status: "ok" }));

/* ─── 404 ───────────────────────────────────────────────── */
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

/* ─── ERROR HANDLER ─────────────────────────────────────── */
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

/* ─── MONGODB + START ───────────────────────────────────── */
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/nearzy", {
  useNewUrlParser: true, useUnifiedTopology: true
}).then(() => {
  console.log("✅ MongoDB connected");
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => console.log(`🚀 Nearzy API running on port ${PORT}`));
}).catch(err => { console.error("❌ MongoDB connection error:", err); process.exit(1); });

module.exports = { app, io };