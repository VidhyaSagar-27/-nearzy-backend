"use strict";
const jwt = require("jsonwebtoken");
const { User } = require("../models");

const protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "nearzy_secret_key_change_in_prod");
    const user = await User.findById(decoded.id).select("-password -otp");
    if (!user || !user.isActive) return res.status(401).json({ message: "User not found or inactive" });
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

const optionalAuth = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "nearzy_secret_key_change_in_prod");
      const user = await User.findById(decoded.id).select("-password -otp");
      if (user) req.user = user;
    }
  } catch (_) {}
  next();
};

module.exports = { protect, authorize, optionalAuth };
