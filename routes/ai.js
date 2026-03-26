/* routes/ai.js
   ─────────────────────────────────────────────────────────────
   Nearzy AI Proxy — keeps ANTHROPIC_API_KEY secret on the server.
   All browser-side AI calls are routed through here.
   ─────────────────────────────────────────────────────────────
   Setup:
     1. npm install node-fetch    (if Node < 18; Node 18+ has fetch built-in)
     2. In server.js add:  app.use("/api/ai", require("./routes/ai"));
     3. In .env add:       ANTHROPIC_API_KEY=sk-ant-api03-XXXXX
   ───────────────────────────────────────────────────────────── */
"use strict";

const router      = require("express").Router();
const rateLimit   = require("express-rate-limit");

/* ── Auth middleware (reuse your existing one) ─────────────────
   Adjust the path if your middleware is elsewhere.              */
let auth;
try {
  auth = require("../middleware/auth");
} catch(e) {
  /* Fallback: no-op if middleware path differs */
  auth = (req, res, next) => next();
  console.warn("[AI Route] Could not load auth middleware — AI route is unprotected. Fix the path in routes/ai.js");
}

/* ── Strict rate limit for AI endpoint ────────────────────────
   20 AI requests per user per 5 minutes prevents abuse.        */
const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max:      20,
  keyGenerator: req => req.user?._id?.toString() || req.ip,
  message:  { error: "Too many AI requests. Please wait a few minutes." }
});

/* ── POST /api/ai/chat ────────────────────────────────────────
   Body: { messages, system?, max_tokens?, model? }             */
router.post("/chat", auth, aiLimiter, async (req, res) => {
  const { messages, system, max_tokens, model } = req.body;

  /* Validate */
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }
  if (messages.length > 20) {
    return res.status(400).json({ error: "Too many messages in context (max 20)" });
  }

  /* Check API key is configured */
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[AI Route] ANTHROPIC_API_KEY is not set in .env");
    return res.status(503).json({ error: "AI service not configured. Contact admin." });
  }

  /* Build request body */
  const requestBody = {
    model:      model      || "claude-sonnet-4-6",
    max_tokens: Math.min(max_tokens || 500, 2048),   // cap at 2048 for cost control
    messages
  };
  if (system) requestBody.system = system;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[AI Route] Anthropic error:", response.status, data);
      return res.status(response.status).json({
        error: data.error?.message || "AI service error"
      });
    }

    /* Log usage for cost monitoring (optional) */
    if (process.env.NODE_ENV !== "production") {
      const usage = data.usage || {};
      console.log(`[AI] user=${req.user?._id} in=${usage.input_tokens} out=${usage.output_tokens}`);
    }

    res.json(data);

  } catch (err) {
    console.error("[AI Route] Fetch error:", err.message);
    res.status(502).json({ error: "Could not reach AI service. Try again." });
  }
});

/* ── POST /api/ai/analyze-image ───────────────────────────────
   For the seller photo-to-product listing feature.
   Body: { base64, mediaType, prompt }                          */
router.post("/analyze-image", auth, aiLimiter, async (req, res) => {
  const { base64, mediaType, prompt } = req.body;
  if (!base64 || !mediaType) return res.status(400).json({ error: "base64 and mediaType required" });

  /* Only sellers/admins can analyze images */
  if (!["seller", "admin", "superadmin"].includes(req.user?.role)) {
    return res.status(403).json({ error: "Only shop owners can use photo listing" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "AI service not configured" });
  }

  /* Limit image size: base64 of 5MB image = ~6.7MB string */
  if (base64.length > 7_000_000) {
    return res.status(400).json({ error: "Image too large. Max 5MB." });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 400,
        messages: [{
          role:    "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text",  text: prompt || 'Analyze this food image for an Indian delivery app. Reply ONLY JSON (no markdown): {"name":"product name","description":"appetizing 1-2 sentence description","category":"Food|Grocery|Bakery|Sweets|Beverages|Other","suggestedPrice":N,"tags":["tag1","tag2"],"servingSize":"e.g. 1 plate"}' }
          ]
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "Analysis failed" });
    res.json(data);
  } catch(err) {
    res.status(502).json({ error: "Image analysis failed. Try again." });
  }
});

module.exports = router;