"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { createStockAlertWorker } = require("../stock-alerts");

test("PostgreSQL stock alert outbox delivers once per transition and recovers", {
  skip: !process.env.DATABASE_URL,
  timeout: 30_000
}, async () => {
  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = "stock_alert_test_" + require("node:crypto").randomUUID().replace(/-/g, "");
  let pool;
  const sent = [];
  const fetchImpl = async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return { ok: true, async json() { return { ok: true }; } };
  };
  const logger = { warn() {}, error(message) { throw new Error(message); } };

  try {
    await adminPool.query('CREATE SCHEMA "' + schema + '"');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: "-c search_path=" + schema
    });
    await pool.query(`
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        stock INTEGER NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);
    await pool.query("INSERT INTO products(id,name,stock) VALUES('p1','Test Burger',4)");

    const worker = createStockAlertWorker({
      pool,
      env: { TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "test-chat" },
      fetchImpl,
      logger
    });
    await worker.ensureSchema();

    const first = await worker.pollOnce();
    assert.equal(first.queued, 1);
    assert.equal(first.delivered, 1);
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /LOW STOCK/);

    const second = await worker.pollOnce();
    assert.equal(second.queued, 0);
    assert.equal(sent.length, 1, "unchanged low stock must not duplicate alerts");

    await pool.query("UPDATE products SET stock=0 WHERE id='p1'");
    const third = await worker.pollOnce();
    assert.equal(third.queued, 1);
    assert.equal(sent.length, 2);
    assert.match(sent[1].text, /OUT OF STOCK/);

    await pool.query("UPDATE products SET stock=9 WHERE id='p1'");
    const fourth = await worker.pollOnce();
    assert.equal(fourth.queued, 1);
    assert.equal(sent.length, 3);
    assert.match(sent[2].text, /STOCK RECOVERED/);

    const outbox = await pool.query("SELECT COUNT(*)::int AS count FROM assistant_stock_alert_outbox WHERE delivered_at IS NOT NULL");
    assert.equal(outbox.rows[0].count, 3);
  } finally {
    if (pool) await pool.end();
    await adminPool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await adminPool.end();
  }
});
