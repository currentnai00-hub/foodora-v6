"use strict";

const LOW_STOCK_THRESHOLD = 5;
const CHAT_MAX_CHARS = 1200;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const MAX_LIST_ITEMS = 20;

function dhakaDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value || "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

function normaliseStatus(value) {
  return String(value || "Unknown").trim().toLowerCase();
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function buildStoreContext(products, orders, now = new Date()) {
  const safeProducts = (Array.isArray(products) ? products : []).filter(Boolean);
  const safeOrders = (Array.isArray(orders) ? orders : []).filter(Boolean);
  const active = safeProducts.filter(p => p.active !== false);
  const mappedProducts = active.map(p => ({
    name: String(p.name || "Unnamed product").slice(0, 80),
    category: String(p.category || "").slice(0, 50),
    stock: safeNumber(p.stock),
    price: safeNumber(p.price)
  }));
  const lowStock = mappedProducts.filter(p => p.stock <= LOW_STOCK_THRESHOLD);
  const statusCounts = {};
  let grossOrderValueExcludingCancelled = 0;
  let todayOrders = 0;
  for (const order of safeOrders) {
    const rawStatus = String(order.status || "Unknown").trim().slice(0, 40) || "Unknown";
    statusCounts[rawStatus] = (statusCounts[rawStatus] || 0) + 1;
    if (normaliseStatus(rawStatus) !== "cancelled") {
      grossOrderValueExcludingCancelled += safeNumber(order.total);
    }
    const created = order.createdAt || order.created_at;
    if (created && dhakaDateKey(created) === dhakaDateKey(now)) todayOrders++;
  }
  return {
    currency: "BDT",
    products: mappedProducts.slice(0, 500),
    productSummary: {
      total: safeProducts.length, active: active.length,
      lowStockCount: lowStock.filter(p => p.stock > 0).length,
      outOfStockCount: lowStock.filter(p => p.stock === 0).length,
      lowStockProducts: lowStock
    },
    orderSummary: {
      total: safeOrders.length, today: todayOrders, statusCounts,
      grossOrderValueExcludingCancelled
    },
    dataNote: "Aggregated store data only. Customer names, phone numbers, addresses, payment transaction IDs, passwords and session data are excluded."
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
      for (const [id, value] of buckets) {
        if (current - value.start >= windowMs) buckets.delete(id);
      }
    }
    return previous.count <= limit;
  };
}

function answerFreeAssistant(message, context) {
  const q = String(message || "").toLowerCase().normalize("NFKC").trim();
  const has = (...terms) => terms.some(term => q.includes(term));
  const products = Array.isArray(context.products) ? context.products : [];
  const summary = context.productSummary || {};
  const orders = context.orderSummary || {};
  const statuses = orders.statusCounts || {};
  const money = value => "৳" + Math.round(safeNumber(value)).toLocaleString("en-BD");
  const low = products.filter(p => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD);
  const out = products.filter(p => p.stock === 0);
  const pending = Object.entries(statuses)
    .filter(([status]) => !["delivered", "cancelled"].includes(normaliseStatus(status)))
    .reduce((total, [, count]) => total + count, 0);

  if (has("help", "কি কি", "কী কী", "সাহায্য", "what can you", "কী জানতে")) {
    return "আমি Foodora Free Smart Assistant V2। পণ্য খোঁজা, ক্যাটাগরি, স্টক, কম/শেষ স্টক, অর্ডারের অবস্থা, আজকের অর্ডার ও অর্ডার মূল্যের সারাংশ দিতে পারি। আমি শুধু পড়তে পারি—কোনো ডেটা পরিবর্তন, পেমেন্ট বা রিফান্ড করতে পারি না।";
  }
  if (has("হ্যালো", "হাই", "hello", "hi", "hey", "আসসালামু", "সালাম")) {
    return "হ্যালো! আমি Foodora Free Smart Assistant V2। পণ্য, স্টক ও অর্ডার সম্পর্কে বাংলায় বা ইংরেজিতে প্রশ্ন করতে পারো। “চালের স্টক কত?” বা “আজকের অর্ডার কত?” দিয়ে শুরু করো।";
  }
  if (has("out of stock", "out-of-stock", "স্টক শেষ", "স্টক নেই", "শূন্য স্টক", "শেষ হয়েছে", "শেষ হয়েছে")) {
    return out.length ? "স্টক শেষ পণ্য " + out.length + "টি:\n" + out.slice(0, MAX_LIST_ITEMS).map(p => "• " + p.name + " — 0টি").join("\n") : "বর্তমানে কোনো সক্রিয় পণ্যের স্টক শূন্য নেই।";
  }
  if (has("low stock", "কম স্টক", "স্টক কম", "অল্প স্টক", "৫ বা কম", "পাঁচ বা কম")) {
    return low.length ? "কম স্টকে থাকা পণ্য " + low.length + "টি:\n" + low.slice(0, MAX_LIST_ITEMS).map(p => "• " + p.name + " — " + p.stock + "টি").join("\n") : "বর্তমানে ১–৫ স্টকে কোনো সক্রিয় পণ্য নেই।";
  }
  if (has("আজকের অর্ডার", "আজ কত", "today order", "orders today", "আজ কয়টি", "আজ কয়টি")) {
    return "আজকের অর্ডার: " + (orders.today || 0) + "টি। সময় অঞ্চল: বাংলাদেশ (Asia/Dhaka)।";
  }
  if (has("pending", "পেন্ডিং", "অপেক্ষমাণ", "প্রসেসিং", "চলমান অর্ডার", "বাকি অর্ডার")) {
    return "ডেলিভারি সম্পন্ন বা বাতিল হয়নি এমন অর্ডার: " + pending + "টি। মোট অর্ডার: " + (orders.total || 0) + "টি।";
  }
  if (has("revenue", "বিক্রি", "আয়", "আয়", "মোট টাকা", "order value", "অর্ডারের মূল্য", "মোট অর্ডার মূল্য")) {
    return "Cancelled বাদে অর্ডারগুলোর তালিকাভুক্ত মোট মূল্য: " + money(orders.grossOrderValueExcludingCancelled) + "। এটি পেমেন্ট-যাচাইকৃত আয় বা নিট লাভ নয়।";
  }
  if (has("order status", "অর্ডারের অবস্থা", "অর্ডার স্ট্যাটাস", "কতগুলো অর্ডার", "মোট অর্ডার", "total orders")) {
    const entries = Object.entries(statuses);
    return "মোট অর্ডার: " + (orders.total || 0) + "টি।\n" + (entries.length ? entries.map(([status, count]) => "• " + status + ": " + count + "টি").join("\n") : "এখনো কোনো অর্ডার নেই।");
  }
  if (has("সব পণ্য", "product list", "list products", "পণ্যের তালিকা", "products")) {
    return products.length ? "সক্রিয় পণ্যের তালিকা (" + products.length + "টি):\n" + products.slice(0, MAX_LIST_ITEMS).map(p => "• " + p.name + " — স্টক " + p.stock + "টি — " + money(p.price)).join("\n") + (products.length > MAX_LIST_ITEMS ? "\nআরও " + (products.length - MAX_LIST_ITEMS) + "টি পণ্য রয়েছে।" : "") : "কোনো সক্রিয় পণ্য পাওয়া যায়নি।";
  }

  const namedProduct = products.find(p => p.name && q.includes(p.name.toLowerCase()));
  if (namedProduct && has("স্টক", "stock", "দাম", "price", "কত", "how many", "available")) {
    return namedProduct.name + " — স্টক: " + namedProduct.stock + "টি; দাম: " + money(namedProduct.price) + "; ক্যাটাগরি: " + (namedProduct.category || "উল্লেখ নেই") + "।";
  }
  const namedCategory = [...new Set(products.map(p => p.category).filter(Boolean))]
    .find(category => q.includes(category.toLowerCase()));
  if (namedCategory) {
    const matches = products.filter(p => p.category.toLowerCase() === namedCategory.toLowerCase());
    return namedCategory + " ক্যাটাগরিতে " + matches.length + "টি সক্রিয় পণ্য আছে:\n" + matches.slice(0, MAX_LIST_ITEMS).map(p => "• " + p.name + " — স্টক " + p.stock + "টি").join("\n");
  }
  if (has("stock", "স্টক", "inventory", "পণ্যের সংখ্যা", "কত পণ্য", "মোট পণ্য")) {
    return "স্টোর স্টক সারাংশ:\n• সক্রিয় পণ্য: " + (summary.active || 0) + "টি\n• কম স্টক (১–৫): " + (summary.lowStockCount || 0) + "টি\n• স্টক শেষ: " + (summary.outOfStockCount || 0) + "টি\n• মোট ক্যাটালগ পণ্য: " + (summary.total || 0) + "টি";
  }
  return "এই প্রশ্নটি এখনো আমার সমর্থিত রিপোর্টের মধ্যে নেই। চেষ্টা করো: “স্টকের অবস্থা কী?”, “কোন পণ্যের স্টক কম?”, “চালের স্টক কত?”, “আজকের অর্ডার কত?” বা “মোট অর্ডার কত?”। আমি বিনামূল্যের rule-based assistant—সাধারণ ChatGPT-এর মতো সব বিষয়ে উত্তর দিই না।";
}

function registerAssistantRoutes({ app, adminOnly, getProducts, getOrders }) {
  const allowChat = createRateLimiter();
  app.get("/api/admin/assistant/overview", adminOnly, async (req, res) => {
    try {
      const [products, orders] = await Promise.all([getProducts(false), getOrders()]);
      const safeProducts = Array.isArray(products) ? products.filter(Boolean) : [];
      const safeOrders = Array.isArray(orders) ? orders.filter(Boolean) : [];
      const context = buildStoreContext(safeProducts, safeOrders);
      const lowStock = context.productSummary.lowStockProducts
        .map(p => ({ name: p.name, stock: p.stock, active: true }))
        .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
      const pendingOrders = safeOrders.filter(o => !["delivered", "cancelled"].includes(normaliseStatus(o.status)));
      res.set("Cache-Control", "no-store").json({
        ok: true, generatedAt: new Date().toISOString(), mode: "read-only",
        threshold: LOW_STOCK_THRESHOLD,
        metrics: {
          totalProducts: context.productSummary.total,
          activeProducts: context.productSummary.active,
          lowStockCount: context.productSummary.lowStockCount + context.productSummary.outOfStockCount,
          outOfStockCount: context.productSummary.outOfStockCount,
          totalOrders: context.orderSummary.total,
          pendingOrders: pendingOrders.length,
          todayOrders: context.orderSummary.today
        },
        lowStock,
        capabilities: { websiteReadAccess: true, websiteWriteAccess: false, freeAssistantEnabled: true, aiProviderConfigured: false, voiceEnabled: false, version: "2.0.0" }
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
      return res.json({ ok: true, answer: answerFreeAssistant(message, context), mode: "free-rule-based-read-only", version: "2.0.0" });
    } catch (error) {
      console.error("Foodora free assistant failed:", error.message);
      return res.status(500).json({ error: "Store insights are temporarily unavailable. Please try again." });
    }
  });
}

module.exports = { registerAssistantRoutes, buildStoreContext, createRateLimiter, answerFreeAssistant, dhakaDateKey, normaliseStatus };
