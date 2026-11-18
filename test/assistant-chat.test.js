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
