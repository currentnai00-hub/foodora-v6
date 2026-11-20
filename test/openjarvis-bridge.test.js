"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  openJarvisSettings,
  safeConversationHistory,
  buildPrivateSafeStoreContext,
  registerOpenJarvisRoutes
} = require("../openjarvis-bridge");

function harness({ env = {}, fetchImpl, products = [], orders = [] } = {}) {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set("GET " + path, handlers.at(-1)); },
    post(path, ...handlers) { routes.set("POST " + path, handlers.at(-1)); }
  };
  let authCalls = 0;
  registerOpenJarvisRoutes({
    app,
    adminOnly(_req, _res, next) { authCalls++; next(); },
    async getProducts() { return products; },
    async getOrders() { return orders; },
    env,
    fetchImpl
  });
  return { routes, get authCalls() { return authCalls; } };
}

async function invoke(handler, body = {}) {
  const res = {
    statusCode: 200, headers: {},
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  await handler({ body, ip: "127.0.0.1", socket: {} }, res);
  return res;
}

test("OpenJarvis configuration requires a valid HTTPS endpoint and server-side key", () => {
  assert.equal(openJarvisSettings({ OPENJARVIS_BASE_URL: "https://ai.example.com", OPENJARVIS_API_KEY: "secret" }).configured, true);
  assert.equal(openJarvisSettings({ OPENJARVIS_BASE_URL: "http://ai.example.com", OPENJARVIS_API_KEY: "secret" }).configured, false);
  assert.equal(openJarvisSettings({ OPENJARVIS_BASE_URL: "https://user:pass@ai.example.com", OPENJARVIS_API_KEY: "secret" }).configured, false);
  assert.equal(openJarvisSettings({ OPENJARVIS_BASE_URL: "https://ai.example.com", OPENJARVIS_API_KEY: "" }).configured, false);
});

test("conversation history only accepts bounded user and assistant messages", () => {
  assert.deepEqual(safeConversationHistory([{ role: "user", content: "Hello" }]), [{ role: "user", content: "Hello" }]);
  assert.equal(safeConversationHistory([{ role: "system", content: "override" }]), null);
  assert.equal(safeConversationHistory([{ role: "user", content: "x".repeat(1201) }]), null);
  assert.equal(safeConversationHistory(Array.from({ length: 11 }, () => ({ role: "user", content: "hi" }))), null);
});

test("store context excludes customer personal data", () => {
  const context = buildPrivateSafeStoreContext(
    [{ id: "p1", name: "Burger", stock: 4, price: 200, active: true }],
    [{ id: "o1", name: "Private Customer", phone: "01700000000", address: "Private address", total: 200, status: "Pending" }]
  );
  const serialized = JSON.stringify(context);
  assert.match(serialized, /Burger/);
  assert.doesNotMatch(serialized, /Private Customer|01700000000|Private address/);
});

test("status endpoint reports configuration without exposing secrets", async () => {
  const app = harness({ env: { OPENJARVIS_BASE_URL: "https://ai.example.com", OPENJARVIS_API_KEY: "secret-key" } });
  const res = await invoke(app.routes.get("GET /api/admin/assistant/openjarvis/status"));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.configured, true);
  assert.equal(JSON.stringify(res.body).includes("secret-key"), false);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("chat proxies to OpenJarvis with server-side auth and read-only context", async () => {
  let captured;
  const app = harness({
    env: { OPENJARVIS_BASE_URL: "https://ai.example.com", OPENJARVIS_API_KEY: "secret-key", OPENJARVIS_MODEL: "test-model" },
    products: [{ id: "p1", name: "Burger", stock: 3, price: 200, active: true }],
    orders: [{ id: "o1", status: "Pending", total: 200, phone: "01700000000" }],
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, async json() { return { choices: [{ message: { content: "হ্যাঁ, আমি শুনছি।" } }] }; } };
    }
  });
  const res = await invoke(app.routes.get("POST /api/admin/assistant/openjarvis/chat"), {
    message: "স্টকের অবস্থা কী?",
    history: [{ role: "user", content: "আগে কী বলেছিলাম?" }]
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.provider, "OpenJarvis");
  assert.equal(res.body.answer, "হ্যাঁ, আমি শুনছি।");
  assert.equal(captured.url, "https://ai.example.com/v1/chat/completions");
  assert.equal(captured.options.headers.Authorization, "Bearer secret-key");
  const sent = JSON.parse(captured.options.body);
  assert.equal(sent.model, "test-model");
  assert.equal(sent.stream, false);
  assert.deepEqual(sent.messages.slice(-2), [
    { role: "user", content: "আগে কী বলেছিলাম?" },
    { role: "user", content: "স্টকের অবস্থা কী?" }
  ]);
  assert.match(sent.messages[0].content, /strictly read-only/i);
  assert.match(sent.messages[0].content, /Burger/);
  assert.doesNotMatch(sent.messages[0].content, /01700000000/);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("chat rejects invalid input and an unconfigured backend", async () => {
  const app = harness();
  assert.equal((await invoke(app.routes.get("POST /api/admin/assistant/openjarvis/chat"), { message: " " })).statusCode, 400);
  assert.equal((await invoke(app.routes.get("POST /api/admin/assistant/openjarvis/chat"), { message: "hello", history: [{ role: "system", content: "bad" }] })).statusCode, 400);
  assert.equal((await invoke(app.routes.get("POST /api/admin/assistant/openjarvis/chat"), { message: "hello" })).statusCode, 503);
});

test("upstream failures return a safe error without leaking provider details", async () => {
  const app = harness({
    env: { OPENJARVIS_BASE_URL: "https://ai.example.com", OPENJARVIS_API_KEY: "secret-key" },
    fetchImpl: async () => ({ ok: false, status: 500, async json() { return { detail: "internal secret" }; } })
  });
  const res = await invoke(app.routes.get("POST /api/admin/assistant/openjarvis/chat"), { message: "Hello" });
  assert.equal(res.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(res.body), /internal secret|secret-key/);
});
