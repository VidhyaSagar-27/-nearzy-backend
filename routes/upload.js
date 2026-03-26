"use strict";
const router = require("express").Router();
const { protect } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");

// Memory storage — upload to Cloudinary from buffer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = [".jpg",".jpeg",".png",".webp",".pdf"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Only images and PDFs allowed"));
  }
});

/* POST /api/upload/image */
router.post("/image", protect, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // If Cloudinary is configured, upload there
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const cloudinary = require("cloudinary").v2;
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "nearzy", resource_type: "auto" },
          (error, result) => error ? reject(error) : resolve(result)
        );
        stream.end(req.file.buffer);
      });
      return res.json({ success: true, url: result.secure_url, publicId: result.public_id });
    }

    // Fallback: return placeholder
    res.json({ success: true, url: `https://placehold.co/400x300/fc8019/fff?text=Uploaded`, message: "Cloudinary not configured — using placeholder" });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* POST /api/upload/prescription */
router.post("/prescription", protect, upload.single("prescription"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    // In production, store and notify pharmacist
    res.json({ success: true, message: "Prescription received. A pharmacist will review and contact you within 30 minutes.", referenceId: "RX" + Date.now() });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
