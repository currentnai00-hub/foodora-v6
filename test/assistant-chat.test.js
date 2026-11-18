"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildStoreContext, createRateLimiter, registerAssistantRoutes } = require("../assistant");

test("assistant context contains store aggregates without customer personal data", () => {
  const context = buildStoreContext(
    [{ id: "p1", name: "Burger", category: "Food", stock: 2, price: 250, active: true }],
    [{ id: "o1", name: "Private Customer", phone: "01700000000", address: "Private address", total: 500, status: "Pending", createdAt: new Date().toISOString() }]
  );
  const serialized = JSON.stringify(context);
  assert.equal(context.productSummary.lowStockCount, 1);
  assert.equal(context.orderSummary.total, 1);
  assert.equal(context.orderSummary.statusCounts.Pending, 1);
  assert.equal(serialized.includes("Private Customer"), false);
  assert.equal(serialized.includes("01700000000"), false);
  assert.equal(serialized.includes("Private address"), false);
});

test("assistant rate limiter blocks requests after configured limit", () => {
  let now = 1000;
  const allow = createRateLimiter({ now: () => now, limit: 2, windowMs: 100 });
  assert.equal(allow("admin"), true);
  assert.equal(allow("admin"), true);
  assert.equal(allow("admin"), false);
  now += 101;
  assert.equal(allow("admin"), true);
});

function createHarness({ env = {}, fetchImpl = async () => ({ ok: true, async json() { return { choices: [{ message: { content: "Hello" } }] }; }) } = {}) {
  const routes = {};
  const app = { get(path, ...handlers) { routes["GET " + path] = handlers.at(-1); }, post(path, ...handlers) { routes["POST " + path] = handlers.at(-1); } };
  registerAssistantRoutes({
    app, adminOnly: (_req, _res, next) => next(),
    getProducts: async () => [{ id: "p1", name: "Burger", stock: 3, price: 200, active: true }],
    getOrders: async () => [{ id: "o1", name: "Customer secret", phone: "01811111111", address: "Private", total: 300, status: "Pending" }],
    env, fetchImpl
  });
  return routes;
}

async function invoke(handler, body = {}) {
  const headers = {};
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { headers[name] = value; return this; },
    json(value) { this.body = value; return this; }
  };
  await handler({ body, ip: "127.0.0.1", socket: {} }, res);
  return res;
}

test("chat endpoint fails closed when provider is not configured", async () => {
  const routes = createHarness();
  const res = await invoke(routes["POST /api/admin/assistant/chat"], { message: "Show stock" });
  assert.equal(res.statusCode, 503);
});

test("chat endpoint validates message length", async () => {
  const routes = createHarness({ env: { FOODORA_AI_API_KEY: "test-key" } });
  const res = await invoke(routes["POST /api/admin/assistant/chat"], { message: "x".repeat(1201) });
  assert.equal(res.statusCode, 400);
});

test("chat endpoint calls provider with private-data-free context", async () => {
  let request;
  const routes = createHarness({
    env: { FOODORA_AI_API_KEY: "test-key", FOODORA_AI_MODEL: "test-model" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, async json() { return { choices: [{ message: { content: "There is one low-stock product." } }] }; };
    }
  });
  const res = await invoke(routes["POST /api/admin/assistant/chat"], { message: "How is my stock?" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.answer, "There is one low-stock product.");
  assert.equal(request.url, "https://api.openai.com/v1/chat/completions");
  const body = JSON.parse(request.options.body);
  const prompt = body.messages[0].content;
  assert.equal(prompt.includes("Customer secret"), false);
  assert.equal(prompt.includes("01811111111"), false);
  assert.equal(prompt.includes("Private"), false);
  assert.match(prompt, /strictly read-only/);
  assert.equal(request.options.headers.Authorization, "Bearer test-key");
});
