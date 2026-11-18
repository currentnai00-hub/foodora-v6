"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildStoreContext, createRateLimiter, answerFreeAssistant, registerAssistantRoutes, dhakaDateKey } = require("../assistant");

const now = new Date("2026-11-18T06:00:00.000Z");
const sample = buildStoreContext([
  { id:"p1", name:"Burger", category:"Food", stock:3, price:200, active:true },
  { id:"p2", name:"Kebab", category:"Food", stock:0, price:170, active:true },
  { id:"p3", name:"Rice", category:"Grocery", stock:20, price:80, active:true },
  { id:"p4", name:"Hidden", category:"Grocery", stock:2, price:50, active:false }
], [
  { id:"o1", name:"Private Customer", phone:"01811111111", address:"Private", total:300, status:"pending", createdAt:now.toISOString() },
  { id:"o2", total:500, status:"Delivered", createdAt:now.toISOString() },
  { id:"o3", total:90, status:"CANCELLED", createdAt:"invalid-date" }
], now);

test("assistant context excludes customer personal data and inactive products", () => {
  const serialized = JSON.stringify(sample);
  assert.equal(sample.productSummary.active, 3);
  assert.equal(sample.productSummary.lowStockCount, 1);
  assert.equal(sample.productSummary.outOfStockCount, 1);
  assert.equal(sample.orderSummary.total, 3);
  assert.equal(serialized.includes("Private Customer"), false);
  assert.equal(serialized.includes("01811111111"), false);
  assert.equal(serialized.includes("Private"), false);
  assert.equal(sample.products.some(p => p.name === "Hidden"), false);
});

test("Dhaka date conversion is stable across UTC date boundary", () => {
  assert.equal(dhakaDateKey("2026-11-17T18:30:00.000Z"), "2026-11-18");
  assert.equal(dhakaDateKey("not-a-date"), "");
});

test("assistant rate limiter resets after its time window", () => {
  let clock = 1000;
  const allow = createRateLimiter({ now: () => clock, limit: 2, windowMs: 100 });
  assert.equal(allow("admin"), true);
  assert.equal(allow("admin"), true);
  assert.equal(allow("admin"), false);
  clock += 101;
  assert.equal(allow("admin"), true);
});

test("V2 reports low and out of stock products separately", () => {
  assert.match(answerFreeAssistant("কোন পণ্যের স্টক কম?", sample), /Burger/);
  assert.match(answerFreeAssistant("Show out of stock products", sample), /Kebab/);
});

test("V2 answers a named product stock and price question", () => {
  const answer = answerFreeAssistant("Burger এর স্টক কত এবং দাম কত?", sample);
  assert.match(answer, /Burger/);
  assert.match(answer, /স্টক: 3টি/);
  assert.match(answer, /৳200/);
});

test("V2 answers category questions without exposing customer data", () => {
  const answer = answerFreeAssistant("Grocery ক্যাটাগরিতে কী কী আছে?", sample);
  assert.match(answer, /Rice/);
  assert.doesNotMatch(answer, /Private Customer|01811111111/);
});

test("V2 counts pending orders case-insensitively", () => {
  const answer = answerFreeAssistant("pending orders কত?", sample);
  assert.match(answer, /1টি/);
});

test("V2 calculates order value excluding cancelled orders and labels it carefully", () => {
  const answer = answerFreeAssistant("মোট অর্ডারের মূল্য কত?", sample);
  assert.match(answer, /৳800/);
  assert.match(answer, /নিট লাভ নয়/);
});

test("V2 does not answer unsupported general questions as if it were an LLM", () => {
  assert.match(answerFreeAssistant("Write me a poem about the moon", sample), /rule-based assistant/);
});

function harness(products = [], orders = []) {
  const routes = {};
  const app = {
    get(path, ...handlers) { routes["GET " + path] = handlers.at(-1); },
    post(path, ...handlers) { routes["POST " + path] = handlers.at(-1); }
  };
  registerAssistantRoutes({
    app, adminOnly: (_req, _res, next) => next(),
    getProducts: async () => products, getOrders: async () => orders
  });
  return routes;
}

async function invoke(handler, body = {}) {
  const res = {
    statusCode: 200, headers: {},
    status(code) { this.statusCode = code; return this; },
    set(key, value) { this.headers[key] = value; return this; },
    json(value) { this.body = value; return this; }
  };
  await handler({ body, ip: "127.0.0.1", socket: {} }, res);
  return res;
}

test("chat endpoint works without a paid API key and remains read-only", async () => {
  const routes = harness([{ id:"p1", name:"Burger", stock:2, price:200, active:true }]);
  const res = await invoke(routes["POST /api/admin/assistant/chat"], { message:"স্টকের অবস্থা কী?" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, "free-rule-based-read-only");
  assert.equal(res.body.version, "2.0.0");
  assert.match(res.body.answer, /Burger|কম স্টক/);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("chat endpoint validates empty and oversized messages", async () => {
  const routes = harness();
  assert.equal((await invoke(routes["POST /api/admin/assistant/chat"], { message:"x".repeat(1201) })).statusCode, 400);
  assert.equal((await invoke(routes["POST /api/admin/assistant/chat"], { message:"  " })).statusCode, 400);
});

test("overview reports active product counts and case-insensitive pending orders", async () => {
  const routes = harness(
    [{ id:"p1", name:"Burger", stock:0, active:true }, { id:"p2", name:"Hidden", stock:1, active:false }],
    [{ status:"pending" }, { status:"DELIVERED" }, { status:"cancelled" }]
  );
  const res = await invoke(routes["GET /api/admin/assistant/overview"]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.metrics.totalProducts, 2);
  assert.equal(res.body.metrics.activeProducts, 1);
  assert.equal(res.body.metrics.lowStockCount, 1);
  assert.equal(res.body.metrics.pendingOrders, 1);
  assert.equal(res.body.capabilities.version, "2.0.0");
});


test("weekly and monthly report boundaries use Asia/Dhaka calendar dates", () => {
  const { dhakaPeriodBounds } = require("../assistant");
  const instant = new Date("2026-11-18T06:00:00.000Z");
  assert.deepEqual(dhakaPeriodBounds("week", instant), { startDate: "2026-11-16", endDateExclusive: "2026-11-23" });
  assert.deepEqual(dhakaPeriodBounds("month", instant), { startDate: "2026-11-01", endDateExclusive: "2026-12-01" });
});

test("period reports exclude cancelled orders and customer personal data", () => {
  const { buildPeriodOrderReport } = require("../assistant");
  const orders = [
    { total: 300, status: "Pending", createdAt: "2026-11-18T04:00:00.000Z", phone: "01700000000" },
    { total: 500, status: "Delivered", createdAt: "2026-11-17T20:00:00.000Z" },
    { total: 900, status: "Cancelled", createdAt: "2026-11-18T04:00:00.000Z" },
    { total: 700, status: "Pending", createdAt: "2026-10-31T18:00:00.000Z" }
  ];
  const report = buildPeriodOrderReport(orders, "week", new Date("2026-11-18T06:00:00.000Z"));
  assert.equal(report.orderCount, 2);
  assert.equal(report.grossOrderValueExcludingCancelled, 800);
  assert.equal(JSON.stringify(report).includes("01700000000"), false);
});

test("assistant answers weekly and monthly report requests with careful value labels", () => {
  const { answerFreeAssistant, buildStoreContext } = require("../assistant");
  const context = buildStoreContext([], [
    { total: 300, status: "Pending", createdAt: "2026-11-18T04:00:00.000Z" },
    { total: 500, status: "Delivered", createdAt: "2026-11-17T20:00:00.000Z" },
    { total: 900, status: "Cancelled", createdAt: "2026-11-18T04:00:00.000Z" }
  ], new Date("2026-11-18T06:00:00.000Z"));
  assert.match(answerFreeAssistant("এই সপ্তাহের রিপোর্ট দাও", context), /৳800/);
  assert.match(answerFreeAssistant("monthly report", context), /৳800/);
  assert.match(answerFreeAssistant("monthly report", context), /নিট লাভ নয়/);
});


test("product analytics aggregates units and distinct orders while excluding cancelled and inactive products", () => {
  const { buildProductAnalytics } = require("../assistant");
  const products = [
    { id:"p1", name:"Burger", category:"Food", active:true },
    { id:"p2", name:"Tea", category:"Drinks", active:true },
    { id:"p3", name:"Rice", category:"Food", active:true },
    { id:"p4", name:"Hidden", category:"Food", active:false }
  ];
  const orders = [
    { status:"Pending", phone:"01700000000", items:[
      { id:"p1", name:"Burger", qty:2, price:100 },
      { id:"p1", name:"Burger", qty:1, price:100 },
      { id:"p2", name:"Tea", qty:1, price:20 }
    ]},
    { status:"Delivered", items:[
      { id:"p1", name:"Burger", qty:1, price:100 },
      { id:"p3", name:"Rice", qty:3, price:50 }
    ]},
    { status:"CANCELLED", items:[{ id:"p2", name:"Tea", qty:9, price:20 }]},
    { status:"Pending", items:[{ id:"p4", name:"Hidden", qty:50, price:1 }]}
  ];
  const result = buildProductAnalytics(products, orders);
  const burger = result.topSelling.find(p => p.name === "Burger");
  assert.equal(burger.unitsSold, 4);
  assert.equal(burger.orderCount, 2);
  assert.equal(result.productsTracked, 3);
  assert.equal(result.productsWithoutSales, 0);
  const food = result.categories.find(c => c.category === "Food");
  assert.equal(food.unitsSold, 7);
  assert.equal(food.orderCount, 2);
  assert.equal(JSON.stringify(result).includes("01700000000"), false);
  assert.equal(JSON.stringify(result).includes("Hidden"), false);
});

test("product analytics reports active products with no sales", () => {
  const { buildProductAnalytics } = require("../assistant");
  const result = buildProductAnalytics([
    { id:"p1", name:"Burger", category:"Food", active:true },
    { id:"p2", name:"Soup", category:"Food", active:true }
  ], [{ status:"Cancelled", items:[{ id:"p1", qty:4 }] }]);
  assert.equal(result.productsWithoutSales, 2);
  assert.equal(result.leastSelling[0].unitsSold, 0);
});

test("assistant answers product sales, top-selling, least-selling and category analytics in Bangla and English", () => {
  const { buildStoreContext, answerFreeAssistant } = require("../assistant");
  const context = buildStoreContext([
    { id:"p1", name:"Burger", category:"Food", stock:5, price:100, active:true },
    { id:"p2", name:"Tea", category:"Drinks", stock:8, price:20, active:true },
    { id:"p3", name:"Soup", category:"Food", stock:4, price:60, active:true }
  ], [
    { status:"Pending", items:[{ id:"p1", name:"Burger", qty:2, price:100 }, { id:"p2", name:"Tea", qty:1, price:20 }] },
    { status:"Delivered", items:[{ id:"p1", name:"Burger", qty:1, price:100 }] }
  ], now);
  assert.match(answerFreeAssistant("top selling products", context), /Burger/);
  assert.match(answerFreeAssistant("সবচেয়ে কম বিক্রি হওয়া পণ্য", context), /Soup/);
  assert.match(answerFreeAssistant("ক্যাটাগরিভিত্তিক বিক্রি দেখাও", context), /Food/);
  assert.match(answerFreeAssistant("Burger কত বিক্রি হয়েছে?", context), /বিক্রি: 3টি/);
});


test("date-wise product trends group Dhaka days, weeks and months and exclude cancelled orders", () => {
  const { buildProductSalesTrend } = require("../assistant");
  const products = [{ id:"p1", name:"Burger", active:true }, { id:"p2", name:"Hidden", active:false }];
  const orders = [
    { id:"o1", status:"Pending", createdAt:"2026-11-18T04:00:00.000Z", items:[{ id:"p1", qty:2, price:100 }] },
    { id:"o2", status:"Delivered", createdAt:"2026-11-17T20:00:00.000Z", items:[{ id:"p1", qty:3, price:100 }] },
    { id:"o3", status:"Cancelled", createdAt:"2026-11-18T04:00:00.000Z", items:[{ id:"p1", qty:9, price:100 }] },
    { id:"o4", status:"Pending", createdAt:"2026-11-18T04:00:00.000Z", items:[{ id:"p2", qty:50, price:1 }] }
  ];
  const now = new Date("2026-11-18T06:00:00.000Z");
  const daily = buildProductSalesTrend(products, orders, "day", now);
  assert.equal(daily.buckets.length, 7);
  assert.equal(daily.buckets.at(-1).period, "2026-11-18");
  assert.equal(daily.buckets.at(-1).unitsSold, 5);
  assert.equal(daily.buckets.at(-1).orderCount, 2);
  const weekly = buildProductSalesTrend(products, orders, "week", now);
  assert.equal(weekly.buckets.length, 8);
  assert.equal(weekly.buckets.at(-1).period, "2026-11-16");
  assert.equal(weekly.buckets.at(-1).unitsSold, 5);
  const monthly = buildProductSalesTrend(products, orders, "month", now);
  assert.equal(monthly.buckets.length, 6);
  assert.equal(monthly.buckets.at(-1).period, "2026-11");
  assert.equal(monthly.buckets.at(-1).unitsSold, 5);
  assert.equal(JSON.stringify(monthly).includes("Hidden"), false);
});

test("assistant responds to daily, weekly and monthly product trend prompts", () => {
  const { buildStoreContext, answerFreeAssistant } = require("../assistant");
  const context = buildStoreContext(
    [{ id:"p1", name:"Burger", active:true }],
    [{ id:"o1", status:"Pending", createdAt:"2026-11-18T04:00:00.000Z", items:[{ id:"p1", qty:2, price:100 }] }],
    new Date("2026-11-18T06:00:00.000Z")
  );
  assert.match(answerFreeAssistant("গত ৭ দিনের বিক্রি দেখাও", context), /2026-11-18/);
  assert.match(answerFreeAssistant("last 8 weeks sales trend", context), /2026-11-16/);
  assert.match(answerFreeAssistant("monthly sales trend", context), /2026-11/);
});
