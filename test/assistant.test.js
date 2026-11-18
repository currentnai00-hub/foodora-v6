"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { registerAssistantRoutes } = require("../assistant");

function setup({ products = [], orders = [] } = {}) {
  const routes = new Map();
  const app = { get(path, ...handlers) { routes.set(path, handlers[handlers.length - 1]); } };
  registerAssistantRoutes({
    app,
    adminOnly(_req, _res, next) { next(); },
    async getProducts() { return products; },
    async getOrders() { return orders; }
  });
  const handler = routes.get("/api/admin/assistant/overview");
  const response = {
    headers: {},
    statusCode: 200,
    set(name, value) { this.headers[name] = value; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  return { handler, response };
}

test("overview returns stock metrics without customer data", async () => {
  const { handler, response } = setup({
    products: [
      { id: "a", name: "Burger", stock: 2, active: true },
      { id: "b", name: "Tea", stock: 0, active: true },
      { id: "c", name: "Hidden", stock: 1, active: false },
      { id: "d", name: "Pizza", stock: 8, active: true }
    ],
    orders: [
      { id: "o1", status: "Pending", createdAt: new Date().toISOString(), phone: "01700000000" },
      { id: "o2", status: "Delivered", createdAt: new Date().toISOString() },
      { id: "o3", status: "Cancelled", createdAt: new Date().toISOString() }
    ]
  });
  await handler({}, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.metrics.totalProducts, 4);
  assert.equal(response.body.metrics.lowStockCount, 2);
  assert.equal(response.body.metrics.outOfStockCount, 1);
  assert.equal(response.body.metrics.pendingOrders, 1);
  assert.deepEqual(response.body.lowStock.map((item) => item.id), ["b", "a"]);
  assert.equal(JSON.stringify(response.body).includes("01700000000"), false);
  assert.equal(response.body.capabilities.websiteWriteAccess, false);
});

test("overview handles empty store data", async () => {
  const { handler, response } = setup();
  await handler({}, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.metrics.totalProducts, 0);
  assert.equal(response.body.metrics.totalOrders, 0);
  assert.deepEqual(response.body.lowStock, []);
});

test("overview returns a safe error when data loading fails", async () => {
  const app = { get(_path, ...handlers) { this.handler = handlers[handlers.length - 1]; } };
  registerAssistantRoutes({
    app,
    adminOnly(_req, _res, next) { next(); },
    async getProducts() { throw new Error("database details must not leak"); },
    async getOrders() { return []; }
  });
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await app.handler({}, response);
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "Assistant overview is temporarily unavailable.");
  assert.equal(JSON.stringify(response.body).includes("database details"), false);
});
