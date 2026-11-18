"use strict";

const LOW_STOCK_THRESHOLD = 5;
const CHAT_MAX_CHARS = 1200;
const CHAT_TIMEOUT_MS = 20_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;

function dhakaDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

function buildStoreContext(products, orders) {
  const safeProducts = (Array.isArray(products) ? products : []).filter(Boolean);
  const safeOrders = (Array.isArray(orders) ? orders : []).filter(Boolean);
  const active = safeProducts.filter(p => p.active !== false);
  const lowStock = active.filter(p => Math.max(0, Number(p.stock) || 0) <= LOW_STOCK_THRESHOLD)
    .map(p => ({
      name: String(p.name || "Unnamed product").slice(0, 80),
      category: String(p.category || "").slice(0, 50),
      stock: Math.max(0, Number(p.stock) || 0),
      price: Math.max(0, Number(p.price) || 0)
    })).slice(0, 50);
  const statusCounts = {};
  let revenueTotal = 0;
  let todayOrders = 0;
  const today = dhakaDateKey(new Date());
  for (const order of safeOrders) {
    const status = String(order.status || "Unknown").slice(0, 40);
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const amount = Math.max(0, Number(order.total) || 0);
    if (!["Cancelled"].includes(status)) revenueTotal += amount;
    const created = order.createdAt || order.created_at;
    if (created && dhakaDateKey(created) === today) todayOrders++;
  }
  return {
    currency: "BDT",
    products: safeProducts.filter(p => p.active !== false).slice(0, 100).map(p => ({ name: String(p.name || "Unnamed product").slice(0, 80), category: String(p.category || "").slice(0, 50), stock: Math.max(0, Number(p.stock) || 0), price: Math.max(0, Number(p.price) || 0) })),
    productSummary: {
      total: safeProducts.length,
      active: active.length,
      lowStockCount: lowStock.length,
      outOfStockCount: lowStock.filter(p => p.stock === 0).length,
      lowStockProducts: lowStock
    },
    orderSummary: {
      total: safeOrders.length,
      today: todayOrders,
      statusCounts,
      grossOrderValueExcludingCancelled: revenueTotal
    },
    dataNote: "Aggregated store data only. No customer names, phone numbers, addresses, payment transaction IDs, passwords or session data are provided."
  };
}

function createRateLimiter({ now = Date.now, limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS } = {}) {
  const buckets = new Map();
  return function allow(key) {
    const current = now();
    const previous = buckets.get(key) || { start: current, count: 0 };
    if (current - previous.start >= windowMs) {
      previous.start = current;
      previous.count = 0;
    }
    previous.count++;
    buckets.set(key, previous);
    if (buckets.size > 2000) {
      for (const [id, value] of buckets) if (current - value.start >= windowMs) buckets.delete(id);
    }
    return previous.count <= limit;
  };
}


function answerFreeAssistant(message, context) {
  const q = String(message || "").toLowerCase().normalize("NFKC");
  const has = (...terms) => terms.some(term => q.includes(term));
  const products = context.products || [];
  const summary = context.productSummary || {};
  const orders = context.orderSummary || {};
  const money = value => "৳" + Math.round(Number(value) || 0).toLocaleString("en-BD");
  const low = products.filter(p => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD);
  const out = products.filter(p => p.stock === 0);
  const pending = Object.entries(orders.statusCounts || {}).filter(([s]) => !["Delivered", "Cancelled"].includes(s)).reduce((n, [,c]) => n + c, 0);

  if (has("help", "কি কি", "কী কী", "সাহায্য", "what can you")) return "আমি বিনামূল্যের Foodora Smart Assistant। পণ্য, স্টক, কম স্টক, Out of Stock, অর্ডারের সারাংশ, আজকের অর্ডার এবং মোট অর্ডার মূল্য সম্পর্কে জিজ্ঞাসা করতে পারো। আমি শুধু তথ্য পড়তে পারি—কোনো পণ্য, অর্ডার, পেমেন্ট বা সেটিংস পরিবর্তন করতে পারি না।";
  if (has("হ্যালো", "হাই", "hello", "hi", "hey", "আসসালামু", "সালাম")) return "হ্যালো! আমি Foodora Free Smart Assistant। তোমার স্টোরের পণ্য, স্টক ও অর্ডারের নিরাপদ সারাংশ দিতে পারি। যেমন: “কোন পণ্যের স্টক কম?”";
  if (has("out of stock", "out-of-stock", "স্টক শেষ", "স্টক নেই", "শূন্য স্টক", "শেষ হয়েছে", "শেষ হয়েছে")) return out.length ? "স্টক শেষ হওয়া পণ্য " + out.length + "টি:\n" + out.slice(0,20).map(p => "• " + p.name + " — 0টি").join("\n") : "ভালো খবর—বর্তমানে কোনো সক্রিয় পণ্যের স্টক শূন্য নেই।";
  if (has("low stock", "কম স্টক", "স্টক কম", "অল্প স্টক", "৫ বা কম", "পাঁচ বা কম")) return low.length ? "কম স্টকে থাকা পণ্য " + low.length + "টি:\n" + low.slice(0,20).map(p => "• " + p.name + " — " + p.stock + "টি").join("\n") : "বর্তমানে ৫ বা তার কম স্টকে কোনো সক্রিয় পণ্য নেই।";
  if (has("আজকের অর্ডার", "আজ কত", "today order", "orders today", "আজ কয়টি", "আজ কয়টি")) return "আজকের অর্ডার: " + orders.today + "টি। এটি Dhaka local date অনুযায়ী গণনা করা হয়েছে।";
  if (has("pending", "পেন্ডিং", "অপেক্ষমাণ", "প্রসেসিং", "চলমান অর্ডার")) return "বর্তমানে ডেলিভারি বা বাতিল হয়নি এমন অর্ডার: " + pending + "টি। মোট অর্ডার: " + orders.total + "টি।";
  if (has("revenue", "বিক্রি", "আয়", "আয়", "মোট টাকা", "order value", "অর্ডারের মূল্য")) return "অর্ডারের মোট মূল্য (Cancelled বাদে): " + money(orders.grossOrderValueExcludingCancelled) + "। এটি যাচাইকৃত পেমেন্ট বা নিট লাভ নয়।";
  if (has("কোন পণ্য", "সব পণ্য", "product list", "list products", "পণ্যের তালিকা", "products")) return products.length ? "সক্রিয় পণ্যের তালিকা (" + products.length + "টি):\n" + products.slice(0,25).map(p => "• " + p.name + " — স্টক " + p.stock + "টি — " + money(p.price)).join("\n") : "কোনো সক্রিয় পণ্য পাওয়া যায়নি।";
  if (has("order status", "অর্ডারের অবস্থা", "অর্ডার স্ট্যাটাস", "কতগুলো অর্ডার", "মোট অর্ডার", "total orders")) {
    const statuses = Object.entries(orders.statusCounts || {});
    return "মোট অর্ডার: " + orders.total + "টি।\n" + (statuses.length ? statuses.map(([s,c]) => "• " + s + ": " + c + "টি").join("\n") : "এখনো কোনো অর্ডার নেই।");
  }
  if (has("stock", "স্টক", "inventory", "পণ্যের সংখ্যা", "কত পণ্য", "মোট পণ্য")) return "স্টোর স্টক সারাংশ:\n• সক্রিয় পণ্য: " + summary.active + "টি\n• কম স্টক (১–৫): " + low.length + "টি\n• স্টক শেষ: " + out.length + "টি\n• মোট ক্যাটালগ পণ্য: " + summary.total + "টি";
  return "আমি এখন নির্দিষ্ট কিছু স্টোর-সংক্রান্ত প্রশ্নের উত্তর দিতে পারি। চেষ্টা করো: “স্টকের অবস্থা কী?”, “কোন পণ্যের স্টক কম?”, “আজকের অর্ডার কত?” অথবা “মোট অর্ডার কত?”। আমি বিনামূল্যের rule-based assistant; মুক্তভাবে ChatGPT-এর মতো সব প্রশ্নের উত্তর দিতে পারি না।";
}

function registerAssistantRoutes({ app, adminOnly, getProducts, getOrders, env = process.env, fetchImpl = global.fetch }) {
  const allowChat = createRateLimiter();

  app.get("/api/admin/assistant/overview", adminOnly, async (req, res) => {
    try {
      const [products, orders] = await Promise.all([getProducts(false), getOrders()]);
      const safeProducts = Array.isArray(products) ? products : [];
      const safeOrders = Array.isArray(orders) ? orders : [];
      const lowStock = safeProducts
        .filter((p) => p && p.active !== false && Number(p.stock) <= LOW_STOCK_THRESHOLD)
        .map((p) => ({
          id: String(p.id || ""),
          name: String(p.name || "Unnamed product").slice(0, 100),
          stock: Math.max(0, Number(p.stock) || 0),
          active: p.active !== false
        }))
        .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
      const pendingOrders = safeOrders.filter((o) => o && !["Delivered", "Cancelled"].includes(String(o.status)));
      const today = dhakaDateKey(new Date());
      const todayOrders = safeOrders.filter((o) => {
        const value = o.createdAt || o.created_at;
        return value && dhakaDateKey(value) === today;
      }).length;
      res.set("Cache-Control", "no-store").json({
        ok: true, generatedAt: new Date().toISOString(), mode: "read-only",
        threshold: LOW_STOCK_THRESHOLD,
        metrics: {
          totalProducts: safeProducts.length,
          activeProducts: safeProducts.filter((p) => p && p.active !== false).length,
          lowStockCount: lowStock.length,
          outOfStockCount: lowStock.filter((p) => p.stock === 0).length,
          totalOrders: safeOrders.length, pendingOrders: pendingOrders.length, todayOrders
        },
        lowStock,
        capabilities: {
          websiteReadAccess: true, websiteWriteAccess: false,
          freeAssistantEnabled: true,
          aiProviderConfigured: false,
          voiceEnabled: false
        }
      });
    } catch (error) {
      console.error("Foodora assistant overview failed:", error.message);
      res.status(500).json({ error: "Assistant overview is temporarily unavailable." });
    }
  });

  app.post("/api/admin/assistant/chat", adminOnly, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message || message.length > CHAT_MAX_CHARS) {
      return res.status(400).json({ error: "Message must contain 1–1200 characters." });
    }
    const rateKey = String(req.ip || req.socket?.remoteAddress || "admin");
    if (!allowChat(rateKey)) return res.status(429).json({ error: "Too many messages. Please wait one minute." });
    try {
      const [products, orders] = await Promise.all([getProducts(false), getOrders()]);
      const context = buildStoreContext(products, orders);
      return res.json({ ok: true, answer: answerFreeAssistant(message, context), mode: "free-rule-based-read-only" });
    } catch (error) {
      console.error("Foodora free assistant failed:", error.message);
      return res.status(500).json({ error: "Store insights are temporarily unavailable. Please try again." });
    }
  });
}

module.exports = { registerAssistantRoutes, buildStoreContext, createRateLimiter, answerFreeAssistant };
