"use strict";
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { User, Shop, Product, Promo } = require("../models");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nearzy";

const CITIES = ["Hyderabad","Ramagundam","Warangal","Karimnagar"];

const shops = [
  { name:"Paradise Restaurant", category:"restaurant", city:"Hyderabad", rating:4.7, cuisine:["Hyderabadi","Mughlai"], tags:["biryani","popular","dine-in"], tableBooking:true },
  { name:"Bawarchi Restaurant", category:"restaurant", city:"Hyderabad", rating:4.5, cuisine:["Hyderabadi","North Indian"], tags:["biryani","chicken"] },
  { name:"Green Farms Grocery", category:"grocery", city:"Hyderabad", rating:4.3, tags:["organic","fresh","vegetables"] },
  { name:"MedPlus Pharmacy", category:"pharmacy", city:"Hyderabad", rating:4.6, tags:["medicines","health","24hr"] },
  { name:"Flower World", category:"flower", city:"Hyderabad", rating:4.4, tags:["bouquet","gifts","fresh"] },
  { name:"Al-Baik Chicken", category:"restaurant", city:"Ramagundam", rating:4.5, cuisine:["Arabian","Fast Food"], tags:["chicken","grilled"] },
  { name:"Dairy Fresh", category:"grocery", city:"Ramagundam", rating:4.2, tags:["milk","dairy","fresh"] },
  { name:"City Bakery", category:"bakery", city:"Hyderabad", rating:4.6, tags:["cakes","pastries","bread"] },
];

const productSets = {
  restaurant: [
    { name:"Hyderabadi Dum Biryani", price:280, mrp:320, category:"Biryani", isPopular:true, isBestSeller:true },
    { name:"Chicken Tikka Masala", price:320, mrp:350, category:"Main Course" },
    { name:"Mutton Korma", price:380, mrp:420, category:"Main Course", isVeg:false },
    { name:"Veg Biryani", price:180, mrp:200, category:"Biryani", isVeg:true },
    { name:"Butter Naan (2 pcs)", price:60, mrp:70, category:"Breads", isVeg:true },
    { name:"Raita", price:50, mrp:60, category:"Sides", isVeg:true },
    { name:"Gulab Jamun", price:80, mrp:90, category:"Desserts", isVeg:true },
    { name:"Cold Drinks", price:40, mrp:50, category:"Beverages", isVeg:true },
  ],
  grocery: [
    { name:"Fresh Tomatoes 1kg", price:35, mrp:50, category:"Vegetables", unit:"kg", isVeg:true },
    { name:"Onions 1kg", price:28, mrp:40, category:"Vegetables", unit:"kg", isVeg:true },
    { name:"Basmati Rice 5kg", price:420, mrp:480, category:"Grains", unit:"5kg", isVeg:true },
    { name:"Toor Dal 1kg", price:120, mrp:140, category:"Pulses", unit:"kg", isVeg:true },
    { name:"Sunflower Oil 1L", price:140, mrp:160, category:"Oils", unit:"litre", isVeg:true },
    { name:"Amul Butter 500g", price:280, mrp:300, category:"Dairy", unit:"500g", isVeg:true },
    { name:"Milk 1L", price:68, mrp:70, category:"Dairy", unit:"litre", isVeg:true },
  ],
  pharmacy: [
    { name:"Paracetamol 500mg (10 tabs)", price:18, mrp:25, category:"OTC Medicine" },
    { name:"Dettol Antiseptic 250ml", price:115, mrp:130, category:"First Aid" },
    { name:"Vitamin C 500mg Strip", price:35, mrp:45, category:"Vitamins" },
    { name:"Digene Antacid 200ml", price:60, mrp:75, category:"Digestive" },
    { name:"ORS Electral Powder x5", price:22, mrp:30, category:"Hydration" },
    { name:"Strepsils (24 lozenges)", price:85, mrp:95, category:"Throat" },
  ],
  flower: [
    { name:"Red Rose Bouquet (12)", price:350, mrp:450, category:"Bouquets" },
    { name:"Mixed Flower Arrangement", price:550, mrp:650, category:"Arrangements" },
    { name:"Sunflower Bunch (6)", price:280, mrp:350, category:"Bouquets" },
    { name:"Lily & Rose Combo", price:480, mrp:580, category:"Arrangements" },
  ],
  bakery: [
    { name:"Chocolate Truffle Cake (500g)", price:450, mrp:550, category:"Cakes", isVeg:true },
    { name:"Blueberry Cheesecake Slice", price:120, mrp:150, category:"Cakes", isVeg:true },
    { name:"Butter Croissant", price:65, mrp:80, category:"Pastries", isVeg:true },
    { name:"Cinnamon Danish", price:75, mrp:90, category:"Pastries", isVeg:true },
    { name:"Sourdough Loaf", price:180, mrp:220, category:"Breads", isVeg:true },
  ],
};

const promos = [
  { code:"WELCOME50", type:"flat", value:50, minOrder:100, description:"₹50 off on your first order", forNewUsers:true, perUserLimit:1, isActive:true },
  { code:"NEARZY20", type:"percent", value:20, minOrder:200, maxDiscount:100, description:"20% off up to ₹100", isActive:true },
  { code:"FREEDELIVERY", type:"free_delivery", value:0, minOrder:150, description:"Free delivery on orders above ₹150", isActive:true },
  { code:"FESTIVAL100", type:"flat", value:100, minOrder:500, description:"₹100 off on orders above ₹500", isActive:true },
  { code:"NEWUSER", type:"percent", value:30, minOrder:0, maxDiscount:150, description:"30% off for new users", forNewUsers:true, isActive:true },
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Create admin user
    const adminExists = await User.findOne({ email: "admin@nearzy.in" });
    if (!adminExists) {
      await User.create({
        name: "Nearzy Admin",
        email: "admin@nearzy.in",
        password: "Admin@123",
        role: "admin",
        city: "Hyderabad",
        isVerified: true,
        referralCode: "NRZADMIN"
      });
      console.log("✅ Admin user created: admin@nearzy.in / Admin@123");
    }

    // Create demo user
    const demoExists = await User.findOne({ email: "demo@nearzy.in" });
    if (!demoExists) {
      await User.create({
        name: "Demo User",
        email: "demo@nearzy.in",
        password: "Demo@123",
        role: "user",
        city: "Hyderabad",
        isVerified: true,
        referralCode: "NRZDEMO",
        wallet: { balance: 200, totalCredited: 200, totalDebited: 0 },
        loyalty: { points: 1250, tier: "Silver", lifetime: 1250 }
      });
      console.log("✅ Demo user created: demo@nearzy.in / Demo@123");
    }

    // Create demo shop owner
    let shopOwner = await User.findOne({ email: "shop@nearzy.in" });
    if (!shopOwner) {
      shopOwner = await User.create({
        name: "Shop Owner Demo",
        email: "shop@nearzy.in",
        password: "Shop@123",
        role: "shop_owner",
        city: "Hyderabad",
        isVerified: true
      });
      console.log("✅ Shop owner created: shop@nearzy.in / Shop@123");
    }

    // Create shops and products
    for (const s of shops) {
      const existingShop = await Shop.findOne({ name: s.name });
      if (existingShop) continue;

      const shop = await Shop.create({
        owner: shopOwner._id,
        name: s.name,
        description: `${s.name} — Quality food and products delivered fast`,
        category: s.category,
        address: { line1: "Main Road", city: s.city, state: "Telangana", pincode: "500001", lat: 17.3850 + Math.random()*0.1, lng: 78.4867 + Math.random()*0.1 },
        contact: { phone: "9000000000", email: `contact@${s.name.toLowerCase().replace(/\s+/g,"")}.com` },
        rating: s.rating,
        totalRatings: Math.floor(Math.random() * 500) + 100,
        isVerified: true,
        isActive: true,
        isFeatured: s.name.includes("Paradise") || s.name.includes("MedPlus"),
        tags: s.tags || [],
        cuisine: s.cuisine || [],
        amenities: { tableBooking: s.tableBooking || false },
        delivery: { minOrder: 50, charge: 40, freeAbove: 299, avgTime: 25 + Math.floor(Math.random()*20) }
      });

      // Create products for this shop
      const prods = productSets[s.category] || productSets.restaurant;
      for (const p of prods) {
        await Product.create({
          shop: shop._id,
          name: p.name,
          description: `Fresh and delicious ${p.name}`,
          category: p.category,
          price: p.price,
          mrp: p.mrp,
          discount: Math.round((1 - p.price/p.mrp) * 100),
          unit: p.unit || "piece",
          isVeg: p.isVeg !== false,
          isAvailable: true,
          isPopular: p.isPopular || false,
          isBestSeller: p.isBestSeller || false,
          stock: 999,
          rating: 3.8 + Math.random() * 1.2,
          totalRatings: Math.floor(Math.random() * 200) + 20
        });
      }
      console.log(`✅ Shop seeded: ${s.name} (${prods.length} products)`);
    }

    // Seed promo codes
    for (const p of promos) {
      const exists = await Promo.findOne({ code: p.code });
      if (!exists) {
        await Promo.create({ ...p, validUntil: new Date(Date.now() + 365*24*60*60*1000) });
        console.log(`✅ Promo: ${p.code}`);
      }
    }

    console.log("\n🎉 Database seeded successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Admin:     admin@nearzy.in  /  Admin@123");
    console.log("Demo User: demo@nearzy.in   /  Demo@123");
    console.log("Shop Owner: shop@nearzy.in  /  Shop@123");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    process.exit(0);
  } catch (e) {
    console.error("❌ Seed error:", e);
    process.exit(1);
  }
}

seed();
