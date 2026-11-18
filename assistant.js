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

function dhakaPeriodBounds(period, now = new Date()) {
  const today = dhakaDateKey(now);
  if (!today) return null;
  const [year, month, day] = today.split("-").map(Number);
  const localDay = new Date(Date.UTC(year, month - 1, day));
  let start;
  let end;
  if (period === "week") {
    const weekday = (localDay.getUTCDay() + 6) % 7;
    start = new Date(Date.UTC(year, month - 1, day - weekday));
    end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7));
  } else if (period === "month") {
    start = new Date(Date.UTC(year, month - 1, 1));
    end = new Date(Date.UTC(year, month, 1));
  } else return null;
  const key = date => date.toISOString().slice(0, 10);
  return { startDate: key(start), endDateExclusive: key(end) };
}

function buildPeriodOrderReport(orders, period, now = new Date()) {
  const bounds = dhakaPeriodBounds(period, now);
  if (!bounds) return null;
  const rows = (Array.isArray(orders) ? orders : []).filter(order => {
    if (!order || normaliseStatus(order.status) === "cancelled") return false;
    const created = order.createdAt || order.created_at;
    const day = created ? dhakaDateKey(created) : "";
    return day >= bounds.startDate && day < bounds.endDateExclusive;
  });
  const statusCounts = {};
  let grossOrderValueExcludingCancelled = 0;
  for (const order of rows) {
    const status = String(order.status || "Unknown").trim().slice(0, 40) || "Unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    grossOrderValueExcludingCancelled += safeNumber(order.total);
  }
  const lastDay = new Date(Date.parse(bounds.endDateExclusive + "T00:00:00Z") - 86400000);
  return {
    period, startDate: bounds.startDate, endDate: lastDay.toISOString().slice(0, 10),
    orderCount: rows.length, statusCounts, grossOrderValueExcludingCancelled
  };
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
    id: String(p.id || ""),
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
    periodReports: { week: buildPeriodOrderReport(safeOrders, "week", now), month: buildPeriodOrderReport(safeOrders, "month", now) },
    productAnalytics: buildProductAnalytics(active, safeOrders),
    productSalesTrends: {
      day: buildProductSalesTrend(active, safeOrders, "day", now),
      week: buildProductSalesTrend(active, safeOrders, "week", now),
      month: buildProductSalesTrend(active, safeOrders, "month", now)
    },
    productPerformanceComparison: buildProductPerformanceComparison(active, safeOrders, now),
    inventoryIntelligence: buildInventoryIntelligence(active, safeOrders, now),
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


function buildProductAnalytics(products, orders) {
  const activeProducts = (Array.isArray(products) ? products : [])
    .filter(p => p && p.active !== false);
  const byId = new Map();
  const byName = new Map();
  const allRows = [];
  for (const product of activeProducts) {
    const row = {
      id: String(product.id || ""),
      name: String(product.name || "Unnamed product").slice(0, 80),
      category: String(product.category || "অন্যান্য").slice(0, 50),
      unitsSold: 0,
      orderCount: 0,
      listedValue: 0
    };
    allRows.push(row);
    if (row.id) byId.set(row.id, row);
    byName.set(row.name.toLocaleLowerCase(), row);
  }

  const categoryMap = new Map();
  for (const order of (Array.isArray(orders) ? orders : [])) {
    if (!order || normaliseStatus(order.status) === "cancelled") continue;
    const seenInOrder = new Set();
    const seenCategoriesInOrder = new Set();
    for (const item of (Array.isArray(order.items) ? order.items : [])) {
      if (!item || typeof item !== "object") continue;
      const product = byId.get(String(item.id || "")) ||
        byName.get(String(item.name || "").trim().toLocaleLowerCase());
      if (!product) continue;
      const quantity = Number(item.qty ?? item.quantity);
      const price = Number(item.price);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const qty = Math.min(Math.floor(quantity), 1000000);
      const unitPrice = Number.isFinite(price) && price >= 0 ? price : 0;
      product.unitsSold += qty;
      product.listedValue += unitPrice * qty;
      if (!seenInOrder.has(product.id || product.name)) {
        product.orderCount += 1;
        seenInOrder.add(product.id || product.name);
      }
      const category = product.category || "অন্যান্য";
      const bucket = categoryMap.get(category) || { category, unitsSold: 0, orderCount: 0 };
      bucket.unitsSold += qty;
      if (!seenCategoriesInOrder.has(category)) {
        bucket.orderCount += 1;
        seenCategoriesInOrder.add(category);
      }
      categoryMap.set(category, bucket);
    }
  }

  const rows = allRows;
  const rank = (x, y) => y.unitsSold - x.unitsSold || y.orderCount - x.orderCount || x.name.localeCompare(y.name);
  const topSelling = [...rows].filter(p => p.unitsSold > 0).sort(rank).slice(0, 10);
  const leastSelling = [...rows].sort((x, y) => x.unitsSold - y.unitsSold || x.orderCount - y.orderCount || x.name.localeCompare(y.name)).slice(0, 10);
  return {
    productsTracked: rows.length,
    productsWithSales: rows.filter(p => p.unitsSold > 0).length,
    productsWithoutSales: rows.filter(p => p.unitsSold === 0).length,
    topSelling,
    leastSelling,
    categories: [...categoryMap.values()].sort((x, y) => y.unitsSold - x.unitsSold || x.category.localeCompare(y.category)).slice(0, 10)
  };
}


function buildProductSalesTrend(products, orders, period = "day", now = new Date()) {
  const sizes = { day: 7, week: 8, month: 6 };
  const size = sizes[period];
  if (!size) return null;
  const todayKey = dhakaDateKey(now);
  if (!todayKey) return null;
  const [year, month, day] = todayKey.split("-").map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  let first;
  if (period === "day") first = new Date(today.getTime() - (size - 1) * 86400000);
  else if (period === "week") first = new Date(today.getTime() - (mondayOffset + (size - 1) * 7) * 86400000);
  else first = new Date(Date.UTC(year, month - size, 1));
  const keyFor = date => {
    if (period === "month") return date.toISOString().slice(0, 7);
    if (period === "week") {
      const offset = (date.getUTCDay() + 6) % 7;
      return new Date(date.getTime() - offset * 86400000).toISOString().slice(0, 10);
    }
    return date.toISOString().slice(0, 10);
  };
  const buckets = new Map();
  for (let i = 0; i < size; i++) {
    const date = period === "month"
      ? new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1))
      : new Date(first.getTime() + i * (period === "week" ? 7 : 1) * 86400000);
    const key = keyFor(date);
    buckets.set(key, { period: key, orderIds: new Set(), unitsSold: 0, listedValue: 0, productUnits: new Map() });
  }
  const active = (Array.isArray(products) ? products : []).filter(p => p && p.active !== false);
  const byId = new Map(active.filter(p => p.id != null).map(p => [String(p.id), p]));
  const byName = new Map(active.map(p => [String(p.name || "").trim().toLocaleLowerCase(), p]));
  (Array.isArray(orders) ? orders : []).forEach((order, index) => {
    if (!order || normaliseStatus(order.status) === "cancelled") return;
    const created = order.createdAt || order.created_at;
    const dateKey = created ? dhakaDateKey(created) : "";
    if (!dateKey) return;
    const parsed = new Date(dateKey + "T00:00:00Z");
    const bucketKey = keyFor(parsed);
    const bucket = buckets.get(bucketKey);
    if (!bucket) return;
    let orderHasTrackedItem = false;
    for (const item of (Array.isArray(order.items) ? order.items : [])) {
      if (!item || typeof item !== "object") continue;
      const product = byId.get(String(item.id || "")) ||
        byName.get(String(item.name || "").trim().toLocaleLowerCase());
      const quantity = Number(item.qty ?? item.quantity);
      if (!product || !Number.isFinite(quantity) || quantity <= 0) continue;
      const qty = Math.min(Math.floor(quantity), 1000000);
      if (!qty) continue;
      const price = Number(item.price);
      bucket.unitsSold += qty;
      bucket.listedValue += (Number.isFinite(price) && price >= 0 ? price : 0) * qty;
      const productName = String(product.name || "Unnamed product").slice(0, 80);
      bucket.productUnits.set(productName, (bucket.productUnits.get(productName) || 0) + qty);
      orderHasTrackedItem = true;
    }
    if (orderHasTrackedItem) bucket.orderIds.add(String(order.id || "row-" + index));
  });
  return {
    period,
    buckets: [...buckets.values()].map(bucket => ({
      period: bucket.period,
      orderCount: bucket.orderIds.size,
      unitsSold: bucket.unitsSold,
      listedValue: bucket.listedValue,
      topProducts: [...bucket.productUnits.entries()]
        .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
        .slice(0, 5).map(([name, unitsSold]) => ({ name, unitsSold }))
    }))
  };
}


function buildProductPerformanceComparison(products, orders, now = new Date()) {
  const todayKey = dhakaDateKey(now);
  if (!todayKey) return null;
  const [year, month, day] = todayKey.split("-").map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  const periods = { week: 7, month: 30 };
  const active = (Array.isArray(products) ? products : []).filter(p => p && p.active !== false);
  const byId = new Map(active.filter(p => p.id != null).map(p => [String(p.id), p]));
  const byName = new Map(active.map(p => [String(p.name || "").trim().toLocaleLowerCase(), p]));
  const output = {};
  const key = date => date.toISOString().slice(0, 10);
  for (const [period, days] of Object.entries(periods)) {
    const currentStart = new Date(today.getTime() - (days - 1) * 86400000);
    const previousStart = new Date(currentStart.getTime() - days * 86400000);
    const totals = new Map(active.map(p => [String(p.id || p.name), {
      id: String(p.id || ""), name: String(p.name || "Unnamed product").slice(0, 80), current: 0, previous: 0
    }]));
    for (const order of (Array.isArray(orders) ? orders : [])) {
      if (!order || normaliseStatus(order.status) === "cancelled") continue;
      const created = order.createdAt || order.created_at;
      const dateKey = created ? dhakaDateKey(created) : "";
      if (!dateKey || dateKey < key(previousStart) || dateKey > todayKey) continue;
      const slot = dateKey >= key(currentStart) ? "current" : "previous";
      for (const item of (Array.isArray(order.items) ? order.items : [])) {
        if (!item || typeof item !== "object") continue;
        const product = byId.get(String(item.id || "")) || byName.get(String(item.name || "").trim().toLocaleLowerCase());
        const quantity = Number(item.qty ?? item.quantity);
        if (!product || !Number.isFinite(quantity) || quantity <= 0) continue;
        const qty = Math.min(Math.floor(quantity), 1000000);
        const row = totals.get(String(product.id || product.name));
        if (row && qty > 0) row[slot] += qty;
      }
    }
    const rows = [...totals.values()].map(row => ({
      id: row.id, name: row.name, currentUnits: row.current, previousUnits: row.previous,
      change: row.current - row.previous,
      changePercent: row.previous > 0 ? Math.round(((row.current - row.previous) / row.previous) * 100) : null,
      trend: row.current > row.previous ? "up" : row.current < row.previous ? "down" : "flat"
    })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.name.localeCompare(b.name));
    output[period] = { days, currentStart: key(currentStart), currentEnd: todayKey,
      previousStart: key(previousStart), previousEnd: key(new Date(currentStart.getTime() - 86400000)),
      products: rows.slice(0, 20) };
  }
  return output;
}


function buildInventoryIntelligence(products, orders, now = new Date()) {
  const todayKey = dhakaDateKey(now);
  if (!todayKey) return null;
  const [year, month, day] = todayKey.split("-").map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  const start = new Date(today.getTime() - 29 * 86400000);
  const startKey = start.toISOString().slice(0, 10);
  const active = (Array.isArray(products) ? products : []).filter(p => p && p.active !== false);
  const byId = new Map(active.filter(p => p.id != null).map(p => [String(p.id), p]));
  const byName = new Map(active.map(p => [String(p.name || "").trim().toLocaleLowerCase(), p]));
  const totals = new Map(active.map(p => [String(p.id || p.name), {
    id: String(p.id || ""), name: String(p.name || "Unnamed product").slice(0, 80),
    stock: safeNumber(p.stock), units30d: 0
  }]));
  for (const order of (Array.isArray(orders) ? orders : [])) {
    if (!order || normaliseStatus(order.status) === "cancelled") continue;
    const created = order.createdAt || order.created_at;
    const dateKey = created ? dhakaDateKey(created) : "";
    if (!dateKey || dateKey < startKey || dateKey > todayKey) continue;
    for (const item of (Array.isArray(order.items) ? order.items : [])) {
      if (!item || typeof item !== "object") continue;
      const product = byId.get(String(item.id || "")) ||
        byName.get(String(item.name || "").trim().toLocaleLowerCase());
      const quantity = Number(item.qty ?? item.quantity);
      if (!product || !Number.isFinite(quantity) || quantity <= 0) continue;
      const qty = Math.min(Math.floor(quantity), 1000000);
      const row = totals.get(String(product.id || product.name));
      if (row && qty > 0) row.units30d += qty;
    }
  }
  const rows = [...totals.values()].map(row => {
    const averageDailyDemand = row.units30d / 30;
    const daysOfStock = averageDailyDemand > 0 ? Math.floor(row.stock / averageDailyDemand) : null;
    const targetStock = Math.ceil(averageDailyDemand * 30);
    const suggestedReorder = Math.max(0, targetStock - row.stock);
    const risk = row.stock <= 0 ? "out" :
      averageDailyDemand === 0 ? "no_recent_demand" :
      daysOfStock <= 7 ? "urgent" :
      daysOfStock <= 14 ? "watch" : "healthy";
    return {
      id: row.id, name: row.name, currentStock: row.stock, unitsOrderedLast30Days: row.units30d,
      averageDailyDemand: Number(averageDailyDemand.toFixed(2)), estimatedDaysOfStock: daysOfStock,
      targetStockFor30Days: targetStock, suggestedReorder, risk
    };
  }).sort((x, y) => {
    const rank = { out: 0, urgent: 1, watch: 2, healthy: 3, no_recent_demand: 4 };
    return rank[x.risk] - rank[y.risk] ||
      (x.estimatedDaysOfStock ?? -1) - (y.estimatedDaysOfStock ?? -1) ||
      x.name.localeCompare(y.name);
  });
  return {
    periodDays: 30, startDate: startKey, endDate: todayKey,
    targetPolicy: "Suggested stock target equals observed 30-day ordered quantity; it is a planning estimate, not a supplier lead-time or guaranteed forecast.",
    products: rows.slice(0, 100)
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

  if (has("help", "সাহায্য", "what can you", "কি করতে পারো", "কী করতে পারো", "কীভাবে সাহায্য")) {
    return "আমি Foodora Free Smart Assistant V2। পণ্য খোঁজা, ক্যাটাগরি, স্টক, কম/শেষ স্টক, অর্ডারের অবস্থা, আজকের অর্ডার ও অর্ডার মূল্যের সারাংশ দিতে পারি। আমি শুধু পড়তে পারি—কোনো ডেটা পরিবর্তন, পেমেন্ট বা রিফান্ড করতে পারি না।";
  }
  if (has("হ্যালো", "হাই", "hello", "hi", "hey", "আসসালামু", "সালাম")) {
    return "হ্যালো! আমি Foodora Free Smart Assistant V2। পণ্য, স্টক ও অর্ডার সম্পর্কে বাংলায় বা ইংরেজিতে প্রশ্ন করতে পারো। “চালের স্টক কত?” বা “আজকের অর্ডার কত?” দিয়ে শুরু করো।";
  }
  if (has("out of stock", "out-of-stock", "স্টক শেষ", "স্টক নেই", "শূন্য স্টক", "শেষ হয়েছে", "শেষ হয়েছে")) {
    return out.length ? "স্টক শেষ পণ্য " + out.length + "টি:\n" + out.slice(0, MAX_LIST_ITEMS).map(p => "• " + p.name + " — 0টি").join("\n") : "বর্তমানে কোনো সক্রিয় পণ্যের স্টক শূন্য নেই।";
  }

  const inventory = context.inventoryIntelligence;
  if (has("inventory forecast", "stock forecast", "days of stock", "reorder suggestion", "reorder list", "restock", "কতদিন চলবে", "স্টক কতদিন", "রিস্টক", "পুনরায় অর্ডার", "পুনরায় অর্ডার", "কোন পণ্য আগে অর্ডার")) {
    if (!inventory) return "স্টক পূর্বাভাস তৈরি করা যায়নি।";
    const rows = inventory.products.filter(p => p.risk !== "healthy" || p.suggestedReorder > 0).slice(0, 10);
    return "ইনভেন্টরি পরিকল্পনা (শেষ ৩০ দিন: " + inventory.startDate + " থেকে " + inventory.endDate + "; বাংলাদেশ সময়):\n" +
      (rows.length ? rows.map(p => {
        const coverage = p.estimatedDaysOfStock == null ? "সাম্প্রতিক চাহিদা নেই" : "আনুমানিক " + p.estimatedDaysOfStock + " দিন চলবে";
        const label = p.risk === "out" ? "স্টক শেষ" : p.risk === "urgent" ? "জরুরি" : p.risk === "watch" ? "সতর্কতা" : p.risk === "no_recent_demand" ? "চাহিদা নেই" : "স্বাভাবিক";
        return "• " + p.name + ": " + label + "; স্টক " + p.currentStock + "টি; ৩০ দিনে অর্ডার " + p.unitsOrderedLast30Days + "টি; " + coverage + "; পরিকল্পিত রিস্টক " + p.suggestedReorder + "টি";
      }).join("\n") : "বর্তমানে উল্লেখযোগ্য রিস্টক প্রয়োজন দেখা যাচ্ছে না।") +
      "\nএটি আগের ৩০ দিনের অর্ডার-ভিত্তিক অনুমান; সরবরাহকারীর সময়, ভবিষ্যৎ চাহিদা বা নিশ্চিত বিক্রি বিবেচনা করে না।";
  }

  if (has("low stock", "কম স্টক", "স্টক কম", "অল্প স্টক", "৫ বা কম", "পাঁচ বা কম")) {
    return low.length ? "কম স্টকে থাকা পণ্য " + low.length + "টি:\n" + low.slice(0, MAX_LIST_ITEMS).map(p => "• " + p.name + " — " + p.stock + "টি").join("\n") : "বর্তমানে ১–৫ স্টকে কোনো সক্রিয় পণ্য নেই।";
  }

  if (has("weekly report", "this week", "সাপ্তাহিক রিপোর্ট", "এই সপ্তাহের", "সপ্তাহের রিপোর্ট")) {
    const report = context.periodReports?.week;
    return report ? "সাপ্তাহিক অর্ডার রিপোর্ট (" + report.startDate + " থেকে " + report.endDate + "):\n• অর্ডার: " + report.orderCount + "টি\n• তালিকাভুক্ত মোট অর্ডার মূল্য: " + money(report.grossOrderValueExcludingCancelled) + "\n• স্ট্যাটাস: " + (Object.entries(report.statusCounts).map(([status, count]) => status + " " + count + "টি").join(", ") || "কোনো অর্ডার নেই") + "\nCancelled অর্ডার বাদ; এটি পেমেন্ট-যাচাইকৃত আয় বা নিট লাভ নয়।" : "সাপ্তাহিক রিপোর্ট তৈরি করা যায়নি।";
  }
  if (has("monthly report", "this month", "মাসিক রিপোর্ট", "এই মাসের", "মাসের রিপোর্ট")) {
    const report = context.periodReports?.month;
    return report ? "মাসিক অর্ডার রিপোর্ট (" + report.startDate + " থেকে " + report.endDate + "):\n• অর্ডার: " + report.orderCount + "টি\n• তালিকাভুক্ত মোট অর্ডার মূল্য: " + money(report.grossOrderValueExcludingCancelled) + "\n• স্ট্যাটাস: " + (Object.entries(report.statusCounts).map(([status, count]) => status + " " + count + "টি").join(", ") || "কোনো অর্ডার নেই") + "\nCancelled অর্ডার বাদ; এটি পেমেন্ট-যাচাইকৃত আয় বা নিট লাভ নয়।" : "মাসিক রিপোর্ট তৈরি করা যায়নি।";
  }



  const trends = context.productSalesTrends || {};
  if (has("daily sales trend", "last 7 days", "daily product trend", "দৈনিক বিক্রির প্রবণতা", "গত ৭ দিনের", "গত ৭ দিনের বিক্রি", "শেষ ৭ দিনের বিক্রি")) {
    const report = trends.day;
    return report ? "দৈনিক পণ্য অর্ডার-ট্রেন্ড (শেষ ৭ দিন; বাংলাদেশ সময়):\n" + report.buckets.map(b => "• " + b.period + ": " + b.unitsSold + "টি আইটেম; " + b.orderCount + "টি অর্ডার; তালিকাভুক্ত মূল্য ৳" + Math.round(b.listedValue).toLocaleString("en-BD")).join("\n") + "\nএগুলো বাতিল নয় এমন অর্ডারের আইটেম; পেমেন্ট-যাচাইকৃত বিক্রি নয়।" : "দৈনিক ট্রেন্ড তৈরি করা যায়নি।";
  }
  if (has("weekly sales trend", "last 8 weeks", "weekly product trend", "সাপ্তাহিক বিক্রির প্রবণতা", "গত ৮ সপ্তাহ", "শেষ ৮ সপ্তাহ")) {
    const report = trends.week;
    return report ? "সাপ্তাহিক পণ্য অর্ডার-ট্রেন্ড (শেষ ৮ সপ্তাহ; সপ্তাহ সোমবার থেকে রবিবার):\n" + report.buckets.map(b => "• " + b.period + ": " + b.unitsSold + "টি আইটেম; " + b.orderCount + "টি অর্ডার").join("\n") + "\nএগুলো বাতিল নয় এমন অর্ডারের আইটেম; পেমেন্ট-যাচাইকৃত বিক্রি নয়।" : "সাপ্তাহিক ট্রেন্ড তৈরি করা যায়নি।";
  }
  if (has("monthly sales trend", "last 6 months", "monthly product trend", "মাসিক বিক্রির প্রবণতা", "গত ৬ মাস", "শেষ ৬ মাস")) {
    const report = trends.month;
    return report ? "মাসিক পণ্য অর্ডার-ট্রেন্ড (শেষ ৬ মাস):\n" + report.buckets.map(b => "• " + b.period + ": " + b.unitsSold + "টি আইটেম; " + b.orderCount + "টি অর্ডার").join("\n") + "\nএগুলো বাতিল নয় এমন অর্ডারের আইটেম; পেমেন্ট-যাচাইকৃত বিক্রি নয়।" : "মাসিক ট্রেন্ড তৈরি করা যায়নি।";
  }


  const comparison = context.productPerformanceComparison || {};
  if (has("compare product performance", "product growth", "product decline", "পণ্যের তুলনা", "পণ্যের পারফরম্যান্স তুলনা", "কোন পণ্যের বিক্রি বেড়েছে", "কোন পণ্যের বিক্রি বেড়েছে", "কোন পণ্যের বিক্রি কমেছে")) {
    const period = has("30 day", "30 days", "মাসিক তুলনা", "শেষ ৩০ দিন") ? "month" : "week";
    const report = comparison[period];
    if (!report) return "পণ্যের তুলনামূলক রিপোর্ট তৈরি করা যায়নি।";
    const changed = report.products.filter(p => p.change !== 0).slice(0, 10);
    return "পণ্য পারফরম্যান্স তুলনা (" + report.days + " দিন বনাম আগের " + report.days + " দিন; বাংলাদেশ সময়):\\n" +
      (changed.length ? changed.map(p => "• " + p.name + ": " + p.previousUnits + " → " + p.currentUnits + "টি (" +
        (p.change > 0 ? "+" : "") + p.change + (p.changePercent == null ? "; আগের সময়ে অর্ডার ছিল না" : "; " + (p.changePercent > 0 ? "+" : "") + p.changePercent + "%") + ")").join("\\n")
        : "তুলনার সময়ে কোনো পরিবর্তন নেই বা পর্যাপ্ত অর্ডার-তথ্য নেই।") +
      "\\nএটি অর্ডার করা আইটেমের পরিমাণ; পেমেন্ট-যাচাইকৃত বিক্রি নয়।";
  }

  const analytics = context.productAnalytics || {};
  if (has("top selling", "best selling", "most sold", "সর্বাধিক বিক্রি", "সবচেয়ে বেশি বিক্রি", "সবচেয়ে বেশি বিক্রি", "বেস্ট সেলিং", "জনপ্রিয় পণ্য", "জনপ্রিয় পণ্য")) {
    const rows = Array.isArray(analytics.topSelling) ? analytics.topSelling : [];
    return rows.length
      ? "সবচেয়ে বেশি বিক্রি হওয়া পণ্য (পরিমাণ অনুযায়ী):\n" + rows.slice(0, 10).map((p, i) => (i + 1) + ". " + p.name + " — " + p.unitsSold + "টি; " + p.orderCount + "টি অর্ডারে").join("\n")
      : "এখনো কোনো পণ্যের বিক্রির আইটেম-তথ্য পাওয়া যায়নি।";
  }
  if (has("least selling", "slow selling", "কম বিক্রি", "কম বিক্রিত", "সবচেয়ে কম বিক্রি", "সবচেয়ে কম বিক্রি", "বিক্রি হয়নি", "বিক্রি হয়নি", "বিক্রি নেই")) {
    const rows = Array.isArray(analytics.leastSelling) ? analytics.leastSelling : [];
    return rows.length
      ? "কম বিক্রি হওয়া পণ্য (সক্রিয় ক্যাটালগের মধ্যে):\n" + rows.slice(0, 10).map(p => "• " + p.name + " — " + p.unitsSold + "টি; " + p.orderCount + "টি অর্ডার").join("\n")
      : "কোনো সক্রিয় পণ্য পাওয়া যায়নি।";
  }
  if (has("category sales", "category wise", "ক্যাটাগরিভিত্তিক বিক্রি", "ক্যাটাগরি অনুযায়ী বিক্রি", "কোন ক্যাটাগরি বেশি", "ক্যাটাগরির বিক্রি")) {
    const rows = Array.isArray(analytics.categories) ? analytics.categories : [];
    return rows.length
      ? "ক্যাটাগরিভিত্তিক বিক্রি (আইটেমের পরিমাণ):\n" + rows.map(p => "• " + p.category + " — " + p.unitsSold + "টি; " + p.orderCount + "টি অর্ডার").join("\n")
      : "এই সময়ের অর্ডারগুলোতে কোনো পণ্যের আইটেম-তথ্য পাওয়া যায়নি।";
  }
  const salesProduct = products.find(p => p.name && q.includes(p.name.toLowerCase()));
  if (salesProduct && has("বিক্রি", "sold", "কত অর্ডার", "কয়টি অর্ডার", "কয়টি অর্ডার")) {
    const row = [...(analytics.topSelling || []), ...(analytics.leastSelling || [])]
      .find(p => p.id === salesProduct.id || p.name === salesProduct.name);
    return row ? salesProduct.name + " — বিক্রি: " + row.unitsSold + "টি; যে অর্ডারগুলোতে ছিল: " + row.orderCount + "টি।" : "এই পণ্যের বিক্রির তথ্য পাওয়া যায়নি।";
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
        .map(p => ({ id: p.id, name: p.name, stock: p.stock, active: true }))
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

module.exports = { registerAssistantRoutes, buildStoreContext, createRateLimiter, answerFreeAssistant, dhakaDateKey, dhakaPeriodBounds, buildPeriodOrderReport, buildProductAnalytics, buildProductSalesTrend, buildProductPerformanceComparison, buildInventoryIntelligence, normaliseStatus };
