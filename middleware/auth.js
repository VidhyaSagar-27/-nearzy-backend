const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ message: "No token provided" });
    const token = header.startsWith("Bearer ") ? header.split(" ")[1] : header;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") return res.status(401).json({ message: "Token expired" });
    return res.status(401).json({ message: "Invalid token" });
  }
};

const adminOnly = (req, res, next) => {
  if (!["admin", "superadmin"].includes(req.user.role))
    return res.status(403).json({ message: "Admin access required" });
  next();
};

const superAdminOnly = (req, res, next) => {
  if (req.user.role !== "superadmin")
    return res.status(403).json({ message: "Super Admin access required" });
  next();
};

const sellerOnly = (req, res, next) => {
  if (req.user.role !== "seller")
    return res.status(403).json({ message: "Seller access required" });
  next();
};

const deliveryOnly = (req, res, next) => {
  if (req.user.role !== "delivery")
    return res.status(403).json({ message: "Delivery access required" });
  next();
};

module.exports = { auth, adminOnly, superAdminOnly, sellerOnly, deliveryOnly };