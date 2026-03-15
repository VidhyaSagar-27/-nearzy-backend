const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

// Socket.IO for real-time tracking
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
app.set("io", io);

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/shops", require("./routes/shopRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/payment", require("./routes/paymentRoutes"));
app.use("/api/delivery", require("./routes/deliveryRoutes"));
app.use("/api/cart", require("./routes/cartRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

// Health check
app.get("/", (req, res) => res.json({ message: "Nearzy API Running", version: "1.0.0", status: "OK" }));
app.get("/health", (req, res) => res.json({ status: "OK", time: new Date() }));

// Socket.IO connections
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("joinOrder", (orderId) => socket.join(`order_${orderId}`));
  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
});

// Connect DB and start
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 })
  .then(() => {
    console.log("MongoDB Connected");
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Nearzy server running on port ${PORT}`));
  })
  .catch(err => console.error("MongoDB error:", err));