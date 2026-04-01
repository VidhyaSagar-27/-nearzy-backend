"use strict";
/* routes/ai.js — Complete Nearzy AI Backend
   All AI features proxied securely through backend.
   Endpoints:
     POST /api/ai/chat              — Main chatbot + all NZ_AI.ask calls
     POST /api/ai/analyze-image     — Seller photo-to-listing
     POST /api/ai/diet-coach        — Personalized diet analysis
     POST /api/ai/recipe            — Recipe generation from cart
     POST /api/ai/shopping-list     — Weekly grocery list builder
     POST /api/ai/price-prediction  — Price drop forecasting
     POST /api/ai/loyalty-coach     — Loyalty rewards strategy
     POST /api/ai/voice-order       — Parse voice text to cart items
     POST /api/ai/complaint         — Auto dispute resolution
     POST /api/ai/bundles           — Dynamic combo deals
     POST /api/ai/demand-forecast   — Seller demand forecasting
     POST /api/ai/price-optimize    — Seller pricing advice
     POST /api/ai/shop-assistant    — Per-shop AI chatbot
     POST /api/ai/sentiment         — Customer sentiment + discount
     POST /api/ai/order-summary     — Order summary in one sentence
     POST /api/ai/seller-insight    — Seller dashboard tip
     POST /api/ai/whisperer         — Subconscious craving predictor
     POST /api/ai/food-therapist    — Emotional food counselor
     POST /api/ai/mood              — Mood-based food suggestions
     POST /api/ai/personalize       — Homepage personalization msg
*/
const router    = require("express").Router();
const rateLimit = require("express-rate-limit");
const auth      = require("../middleware/auth");

/* ── Helpers ───────────────────────────────────────────────── */
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";

function getHeaders() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set in .env");
  return {
    "Content-Type":      "application/json",
    "x-api-key":         process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01"
  };
}

async function callClaude({ messages, system, max_tokens = 500, model = DEFAULT_MODEL }) {
  const body = { model, max_tokens, messages };
  if (system) body.system = system;
  const resp = await fetch(ANTHROPIC_URL, { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || `Anthropic error ${resp.status}`);
  return data.content?.[0]?.text || "";
}

function parseJSON(text) {
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); } catch { return null; }
}

/* ── Rate Limiters ─────────────────────────────────────────── */
const generalLimit = rateLimit({ windowMs: 5 * 60 * 1000, max: 30, keyGenerator: r => r.user?._id?.toString() || r.ip, message: { error: "Too many AI requests. Please wait." } });
const heavyLimit   = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, keyGenerator: r => r.user?._id?.toString() || r.ip, message: { error: "Too many requests. Please wait 10 minutes." } });

/* ══════════════════════════════════════════════════════════════
   1. MAIN CHAT — used by NZ_AI.ask() + sendAIMessage()
   ══════════════════════════════════════════════════════════════ */
router.post("/chat", auth, generalLimit, async (req, res) => {
  const { messages, system, max_tokens, model } = req.body;
  if (!messages?.length) return res.status(400).json({ error: "messages required" });
  if (messages.length > 20) return res.status(400).json({ error: "Max 20 messages" });
  try {
    const body = {
      model:      model || DEFAULT_MODEL,
      max_tokens: Math.min(max_tokens || 500, 2048),
      messages:   messages.slice(-16)
    };
    if (system) body.system = system;
    const resp = await fetch(ANTHROPIC_URL, { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: data.error?.message });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message || "AI service unavailable" });
  }
});

/* ══════════════════════════════════════════════════════════════
   2. IMAGE ANALYSIS — Seller photo to product listing
   ══════════════════════════════════════════════════════════════ */
router.post("/analyze-image", auth, heavyLimit, async (req, res) => {
  if (!["seller","admin","superadmin"].includes(req.user?.role))
    return res.status(403).json({ error: "Only sellers can analyze product images" });
  const { base64, mediaType, prompt } = req.body;
  if (!base64 || !mediaType) return res.status(400).json({ error: "base64 and mediaType required" });
  if (base64.length > 8_000_000) return res.status(400).json({ error: "Image too large. Max 5MB." });
  try {
    const defaultPrompt = 'Analyze this food/product image for an Indian delivery app. Reply ONLY valid JSON (no markdown, no extra text): {"name":"product name","description":"appetizing 1-2 sentence description","category":"Food|Grocery|Bakery|Sweets|Beverages|Pharmacy|Flowers|Electronics|Other","suggestedPrice":150,"originalPrice":200,"tags":["fresh","tasty"],"servingSize":"1 plate","unit":"piece"}';
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST", headers: getHeaders(),
      body: JSON.stringify({
        model: DEFAULT_MODEL, max_tokens: 400,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text",  text: prompt || defaultPrompt }
        ]}]
      })
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: data.error?.message });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "Image analysis failed. Try again." });
  }
});

/* ══════════════════════════════════════════════════════════════
   3. DIET COACH — Analyzes order history, gives nutrition advice
   ══════════════════════════════════════════════════════════════ */
router.post("/diet-coach", auth, heavyLimit, async (req, res) => {
  const { orderHistory, question, goals } = req.body;
  const ctx = orderHistory ? `Order history: ${JSON.stringify(orderHistory).slice(0, 800)}` : "No order history yet";
  const goalsStr = goals ? `Health goals: ${goals}` : "";
  try {
    const reply = await callClaude({
      system: "You are a warm, practical AI diet coach and nutritionist for an Indian food delivery app. Give personalized, actionable advice. Use Indian food context. Max 150 words. Be encouraging.",
      messages: [{ role: "user", content: `${ctx}\n${goalsStr}\n\nUser question: ${question || "Analyze my diet and give me 3 actionable improvements for healthier eating."}` }],
      max_tokens: 300
    });
    res.json({ reply });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   4. RECIPE GENERATOR — From cart items
   ══════════════════════════════════════════════════════════════ */
router.post("/recipe", auth, heavyLimit, async (req, res) => {
  const { ingredients, cuisine, servings, dietary } = req.body;
  if (!ingredients?.length) return res.status(400).json({ error: "ingredients required" });
  try {
    const reply = await callClaude({
      system: "You are a creative Indian recipe AI chef. Generate detailed, practical recipes from available ingredients. Format with clear steps.",
      messages: [{ role: "user", content: `Create a detailed recipe using: ${ingredients.join(", ")}. ${cuisine ? `Cuisine: ${cuisine}.` : ""} ${servings ? `Serves: ${servings}.` : ""} ${dietary ? `Dietary: ${dietary}.` : ""} Include ingredients list, step-by-step instructions, cooking time, and nutritional estimate. Max 400 words.` }],
      max_tokens: 700
    });
    res.json({ recipe: reply });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   5. SMART SHOPPING LIST — Weekly grocery planner
   ══════════════════════════════════════════════════════════════ */
router.post("/shopping-list", auth, heavyLimit, async (req, res) => {
  const { orderHistory, familySize, budget, preferences } = req.body;
  try {
    const prompt = `Generate a smart weekly grocery shopping list for India.
Family size: ${familySize || 2} people.
Weekly budget: ₹${budget || 2000}.
Preferences: ${preferences || "balanced diet, Indian cuisine"}.
Order history context: ${orderHistory ? JSON.stringify(orderHistory).slice(0,400) : "none"}.
Reply ONLY as JSON: {"categories":[{"name":"Vegetables","items":[{"name":"Tomatoes","qty":"500g","approxPrice":30,"reason":"daily use"}]}],"totalEstimate":1800,"tips":["Buy seasonal","Bulk buy dal"]}`;
    const raw = await callClaude({
      system: "You are a smart grocery planning AI for Indian households. Return ONLY valid JSON.",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800
    });
    const parsed = parseJSON(raw);
    res.json(parsed || { raw });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   6. PRICE PREDICTION — Forecasts when prices will drop
   ══════════════════════════════════════════════════════════════ */
router.post("/price-prediction", auth, heavyLimit, async (req, res) => {
  const { products, city, season } = req.body;
  if (!products?.length) return res.status(400).json({ error: "products required" });
  try {
    const prompt = `Predict price trends for these products in India.
Products: ${products.map(p => `${p.name} (current: ₹${p.price})`).join(", ")}.
City: ${city || "Hyderabad"}. Season: ${season || "current"}.
Reply ONLY as JSON: {"predictions":[{"product":"name","currentPrice":100,"predictedLow":80,"predictedHigh":120,"bestTimeToBuy":"Monday morning","reason":"weekend demand drops","confidence":78,"trend":"down"}],"tip":"general buying tip"}`;
    const raw = await callClaude({
      system: "You are a market price intelligence AI for Indian hyperlocal delivery. Return ONLY valid JSON.",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600
    });
    const parsed = parseJSON(raw);
    res.json(parsed || { raw });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   7. LOYALTY COACH — Maximize rewards strategy
   ══════════════════════════════════════════════════════════════ */
router.post("/loyalty-coach", auth, generalLimit, async (req, res) => {
  const { points, tier, orderHistory, upcomingOrders } = req.body;
  try {
    const reply = await callClaude({
      system: "You are a Nearzy loyalty rewards strategy AI. Help users maximize their points, tier benefits, and savings. Be specific with numbers. Max 200 words.",
      messages: [{ role: "user", content: `Current points: ${points || 0}. Tier: ${tier || "Bronze"}. Orders: ${orderHistory?.length || 0}. Upcoming: ${upcomingOrders || "none"}. Give me a personalized 3-step strategy to maximize my Nearzy rewards this week. Include specific promo codes to use (NEARZY10, WELCOME, FREESHIP, LOYALTYREDEEM).` }],
      max_tokens: 350
    });
    res.json({ advice: reply });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   8. VOICE ORDER — Parse speech text to cart items
   ══════════════════════════════════════════════════════════════ */
router.post("/voice-order", auth, generalLimit, async (req, res) => {
  const { text, availableProducts } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    const productList = (availableProducts || []).slice(0,40).map(p => `${p._id||p.id}:${p.name}:₹${p.price}`).join(", ");
    const prompt = `Voice order: "${text}".
Available products: ${productList || "biryani, pizza, burger, dosa, chai, coffee, rice, dal, roti"}.
Match voice to products and quantities. Reply ONLY as JSON array (empty if no match):
[{"id":"product_id_or_name","name":"Product Name","qty":2,"price":120}]`;
    const raw = await callClaude({
      system: "You are a voice order parser for an Indian food delivery app. Parse natural language orders to JSON cart items. Match liberally.",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 250
    });
    const parsed = parseJSON(raw);
    res.json(Array.isArray(parsed) ? { items: parsed } : { items: [], raw });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   9. COMPLAINT RESOLVER — Auto dispute resolution
   ══════════════════════════════════════════════════════════════ */
router.post("/complaint", auth, heavyLimit, async (req, res) => {
  const { orderId, orderNum, complaintType, details, orderAmount } = req.body;
  if (!complaintType) return res.status(400).json({ error: "complaintType required" });
  try {
    const prompt = `Complaint for order #${orderNum || orderId}: "${complaintType}". Details: "${details || "none"}". Order amount: ₹${orderAmount || 0}.
Determine fair resolution. Reply ONLY as JSON:
{"fault":"shop|delivery|system|customer","resolution":"clear description of what we'll do","refundPercent":0,"creditPoints":50,"apology":"warm empathetic message to customer","nextStep":"what happens now within 24h"}`;
    const raw = await callClaude({
      system: "You are an AI dispute resolution specialist for a food delivery platform. Be fair to both customer and shop. Avoid full refunds unless clearly justified. Always be empathetic.",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 350
    });
    const parsed = parseJSON(raw);
    res.json(parsed || { apology: "We sincerely apologize and will resolve this within 24 hours.", refundPercent: 0, creditPoints: 50, resolution: "Our team will investigate and contact you shortly.", nextStep: "You will receive an update within 24 hours.", raw });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   10. DYNAMIC BUNDLES — AI-created combo deals
   ══════════════════════════════════════════════════════════════ */
router.post("/bundles", auth, generalLimit, async (req, res) => {
  const { cartItems, availableProducts, timeOfDay, meal } = req.body;
  try {
    const topProds = (availableProducts || []).slice(0,15).map(p => `${p.name}(₹${p.price})`).join(", ");
    const cart = (cartItems || []).map(i => i.name).join(", ") || "empty cart";
    const prompt = `Create 3 personalized food bundle combos.
Time: ${timeOfDay || new Date().getHours()}:00 (${meal || "meal"}).
Current cart: ${cart}.
Available: ${topProds}.
Reply ONLY as JSON array:
[{"name":"Bundle Name","tagline":"catchy tagline","items":["item1","item2","item3"],"originalPrice":400,"bundlePrice":299,"saving":101,"reason":"why this bundle makes sense now","emoji":"🍛"}]`;
    const raw = await callClaude({
      system: "You are an AI bundle deal creator for Indian food delivery. Create practical, appealing combos that save money. Return ONLY valid JSON.",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500
    });
    const parsed = parseJSON(raw);
    res.json({ bundles: Array.isArray(parsed) ? parsed : [] });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   11. DEMAND FORECAST — For sellers
   ══════════════════════════════════════════════════════════════ */
router.post("/demand-forecast", auth, heavyLimit, async (req, res) => {
  if (!["seller","admin","superadmin"].includes(req.user?.role))
    return res.status(403).json({ error: "Sellers only" });
  const { shopOrders, products, shopName } = req.body;
  try {
    const orders = (shopOrders || []).slice(-50);
    const topProd = {};
    orders.forEach(o => (o.items||[]).forEach(i => { topProd[i.name] = (topProd[i.name]||0) + (i.quantity||1); }));
    const topStr = Object.entries(topProd).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,c])=>`${n}(${c}x)`).join(", ");
    const dayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
    const prompt = `Shop: ${shopName || "restaurant"}. Top sellers: ${topStr || "no data yet"}. Total orders: ${orders.length}. Tomorrow is ${dayName}.
Forecast demand. Reply ONLY as JSON:
{"summary":"2 sentence forecast","items":[{"name":"item","expectedOrders":12,"trend":"up|down|stable","stockAdvice":"prepare X portions","confidence":75}],"topTip":"key business tip for tomorrow"}`;
    const raw = await callClaude({
      system: "You are an AI demand forecaster for small Indian food shops. Be specific and practical. Return ONLY valid JSON.",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 450
    });
    const parsed = parseJSON(raw);
    res.json(parsed || { summary: "Order sufficient stock for tomorrow based on your recent trends.", items: [], topTip: "Prepare your top-selling items 30 minutes before peak hours." });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   12. PRICE OPTIMIZER — For sellers
   ══════════════════════════════════════════════════════════════ */
router.post("/price-optimize", auth, heavyLimit, async (req, res) => {
  if (!["seller","admin","superadmin"].includes(req.user?.role))
    return res.status(403).json({ error: "Sellers only" });
  const { products } = req.body;
  if (!products?.length) return res.status(400).json({ error: "products required" });
  try {
    const productStr = products.slice(0,15).map(p => `${p.name}:₹${p.price}(sold:${p.soldCount||0})`).join(", ");
    const prompt = `My products: ${productStr}.
Suggest optimal pricing based on Indian market. Reply ONLY as JSON:
{"items":[{"name":"item","currentPrice":100,"suggestedPrice":120,"reason":"short reason","expectedImpact":"+15% revenue"}],"overallTip":"pricing strategy tip"}`;
    const raw = await callClaude({
      system: "You are an AI pricing strategist for small Indian food shops. Be realistic. Return ONLY valid JSON.",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500
    });
    const parsed = parseJSON(raw);
    res.json(parsed || { items: [], overallTip: "Review competitor pricing monthly and adjust accordingly." });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   13. SHOP ASSISTANT — Per-shop AI chatbot
   ══════════════════════════════════════════════════════════════ */
router.post("/shop-assistant", auth, generalLimit, async (req, res) => {
  const { shopName, shopPersona, tone, question } = req.body;
  if (!question) return res.status(400).json({ error: "question required" });
  try {
    const reply = await callClaude({
      system: `You are the AI assistant for "${shopName || "this shop"}" on Nearzy. ${shopPersona || "You are helpful and friendly."} Tone: ${tone || "friendly"}. Keep responses under 60 words. Answer customer questions about menu, timings, delivery, and specialties.`,
      messages: [{ role: "user", content: question }],
      max_tokens: 150
    });
    res.json({ reply });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   14. SENTIMENT ANALYSIS — Customer review + auto discount
   ══════════════════════════════════════════════════════════════ */
router.post("/sentiment", auth, generalLimit, async (req, res) => {
  const { text, orderAmount } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    const raw = await callClaude({
      system: "You are a customer sentiment AI for food delivery. Return ONLY valid JSON.",
      messages: [{ role: "user", content: `Analyze sentiment of: "${text}". Order amount: ₹${orderAmount||0}. Reply ONLY as JSON: {"sentiment":"positive|negative|neutral","score":75,"discount":10,"message":"empathetic response to customer","apologyNeeded":false}` }],
      max_tokens: 150
    });
    const parsed = parseJSON(raw);
    res.json(parsed || { sentiment: "neutral", discount: 0, message: "Thank you for your feedback!", apologyNeeded: false });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   15. ORDER SUMMARY — One-sentence warm summary
   ══════════════════════════════════════════════════════════════ */
router.post("/order-summary", auth, generalLimit, async (req, res) => {
  const { items, totalAmount, status } = req.body;
  if (!items) return res.status(400).json({ error: "items required" });
  try {
    const summary = await callClaude({
      system: "Write warm, friendly one-sentence order summaries for an Indian food delivery app.",
      messages: [{ role: "user", content: `Items: ${items}. Total: ₹${totalAmount}. Status: ${status}. Write one warm sentence.` }],
      max_tokens: 80
    });
    res.json({ summary });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   16. SELLER INSIGHT — Dashboard business tip
   ══════════════════════════════════════════════════════════════ */
router.post("/seller-insight", auth, generalLimit, async (req, res) => {
  if (!["seller","admin","superadmin"].includes(req.user?.role))
    return res.status(403).json({ error: "Sellers only" });
  const { orders, revenue, pending, topProduct, productCount } = req.body;
  try {
    const insight = await callClaude({
      system: "You are a business advisor for small Indian food shops. Give one actionable tip in 2 sentences.",
      messages: [{ role: "user", content: `Shop stats: Orders:${orders||0}, Revenue:₹${revenue||0}, Pending:${pending||0}, Top:${topProduct||"unknown"}, Products:${productCount||0}. Give one actionable business tip.` }],
      max_tokens: 120
    });
    res.json({ insight });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   17. AI WHISPERER — Subconscious craving predictor
   ══════════════════════════════════════════════════════════════ */
router.post("/whisperer", auth, heavyLimit, async (req, res) => {
  const { hour, cartHistory, availableProducts } = req.body;
  try {
    const prods = (availableProducts || []).slice(0,10).map(p => p.name).join(", ");
    const reply = await callClaude({
      system: "You are a poetic AI that reads subconscious food desires. Be mystical yet practical. Max 80 words.",
      messages: [{ role: "user", content: `Signals: time=${hour||new Date().getHours()}:00, recent orders="${cartHistory||"none"}". Available: ${prods||"biryani, chai, samosa"}. Predict their subconscious food desire with 1 dish, 1 flavor, 1 emotion, 1 recommendation.` }],
      max_tokens: 150
    });
    res.json({ prediction: reply });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   18. FOOD THERAPIST — Emotional food counselor
   ══════════════════════════════════════════════════════════════ */
router.post("/food-therapist", auth, heavyLimit, async (req, res) => {
  const { input, orderHistory, availableProducts } = req.body;
  if (!input) return res.status(400).json({ error: "input required" });
  try {
    const prods = (availableProducts || []).slice(0,8).map(p => p.name).join(", ");
    const therapy = await callClaude({
      system: "You are a warm, non-judgmental AI food therapist. Identify emotional need, validate warmly, suggest healthy alternative, recommend one product. Compassionate and practical. Max 120 words.",
      messages: [{ role: "user", content: `Customer says: "${input}". Order history: ${orderHistory||"none"}. Available: ${prods||"various Indian foods"}. Respond therapeutically.` }],
      max_tokens: 200
    });
    res.json({ response: therapy });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   19. MOOD SUGGESTIONS — Mood-based food recs
   ══════════════════════════════════════════════════════════════ */
router.post("/mood", auth, generalLimit, async (req, res) => {
  const { mood, availableProducts } = req.body;
  if (!mood) return res.status(400).json({ error: "mood required" });
  try {
    const prods = (availableProducts || []).slice(0,20).map(p => `${p.name}(₹${p.price})`).join(", ");
    const raw = await callClaude({
      system: "You are a mood-based food recommendation AI for India. Return ONLY valid JSON.",
      messages: [{ role: "user", content: `Mood: ${mood}. Available: ${prods||"biryani, chai, salad, pizza, soup"}. Recommend 3 foods. Reply ONLY as JSON: {"recommendations":[{"name":"item","reason":"why for this mood","emoji":"🍛","price":150}],"moodMessage":"encouraging message"}` }],
      max_tokens: 300
    });
    const parsed = parseJSON(raw);
    res.json(parsed || { recommendations: [], moodMessage: `Perfect food choices for your ${mood} mood!` });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   20. PERSONALIZE — Homepage welcome message
   ══════════════════════════════════════════════════════════════ */
router.post("/personalize", auth, generalLimit, async (req, res) => {
  const { orderCount, topCategory, loyaltyTier, timeOfDay, name } = req.body;
  try {
    const msg = await callClaude({
      system: "Write short warm personalized homepage messages for a food delivery app. Max 18 words. Sound like a friendly app greeting.",
      messages: [{ role: "user", content: `User: ${name||"there"}, ${orderCount||0} orders, loves ${topCategory||"food"}, ${loyaltyTier||"Bronze"} member, it's ${timeOfDay||"afternoon"}. Write 1 warm greeting.` }],
      max_tokens: 60
    });
    res.json({ message: msg.replace(/"/g, "") });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   21. NEGOTIATOR — AI bargains discounts for customer
   ══════════════════════════════════════════════════════════════ */
router.post("/negotiate", auth, heavyLimit, async (req, res) => {
  const { shopName, orderCount, negotiationText } = req.body;
  try {
    const raw = await callClaude({
      system: "You are an AI negotiation agent. Secure fair discounts. Return ONLY valid JSON.",
      messages: [{ role: "user", content: `Customer with ${orderCount||1} orders at "${shopName||"this shop"}" says: "${negotiationText||"I order here regularly, can I get a discount?"}". Simulate shop's response. Reply ONLY as JSON: {"discount":10,"addon":"free item or empty string","message":"shop's warm response","success":true}` }],
      max_tokens: 150
    });
    const parsed = parseJSON(raw);
    res.json(parsed || { discount: 5, addon: "", message: "We appreciate your loyalty! Enjoy a small discount on your next order.", success: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   22. SUPPORT CHAT — Customer support queries
   ══════════════════════════════════════════════════════════════ */
router.post("/support", auth, generalLimit, async (req, res) => {
  const { message, orderContext } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });
  try {
    const reply = await callClaude({
      system: "You are a friendly Nearzy customer support AI. Help with orders, delivery, refunds, and app features. Be concise and helpful. Max 80 words. Always offer to escalate to human if needed.",
      messages: [{ role: "user", content: `${orderContext ? `Order context: ${JSON.stringify(orderContext).slice(0,200)}\n\n` : ""}Customer: ${message}` }],
      max_tokens: 180
    });
    res.json({ reply });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;