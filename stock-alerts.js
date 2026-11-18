"use strict";

const { randomUUID } = require("node:crypto");

const LOW_STOCK_THRESHOLD = 5;
const POLL_INTERVAL_MS = 60_000;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 15 * 60_000;

function stockState(stock, threshold = LOW_STOCK_THRESHOLD) {
  const value = Math.max(0, Number(stock) || 0);
  if (value === 0) return "out";
  if (value <= threshold) return "low";
  return "healthy";
}

function transitionFor(previous, current) {
  if (!previous) return current === "healthy" ? null : current;
  if (previous === current) return null;
  if (previous === "healthy" && current === "low") return "low";
  if (previous === "healthy" && current === "out") return "out";
  if (previous === "low" && current === "out") return "out";
  if (previous !== "healthy" && current === "healthy") return "recovered";
  return null;
}

function createStockAlertWorker({ pool, env = process.env, fetchImpl = global.fetch, logger = console }) {
  let timer = null;
  let running = false;

  async function ensureSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assistant_stock_alert_state (
        product_id TEXT PRIMARY KEY,
        product_name TEXT NOT NULL,
        stock_state TEXT NOT NULL CHECK (stock_state IN ('healthy','low','out')),
        stock INTEGER NOT NULL CHECK (stock >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assistant_stock_alert_outbox (
        id UUID PRIMARY KEY,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('low','out','recovered')),
        stock INTEGER NOT NULL CHECK (stock >= 0),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_until TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS assistant_stock_alert_outbox_pending_idx
      ON assistant_stock_alert_outbox(next_attempt_at, created_at)
      WHERE delivered_at IS NULL
    `);
  }

  async function sendTelegram(event) {
    const token = env.TELEGRAM_BOT_TOKEN || "";
    const chatId = env.TELEGRAM_CHAT_ID || "";
    if (!token || !chatId) throw new Error("Telegram credentials are not configured");

    let heading;
    let detail;
    if (event.event_type === "recovered") {
      heading = "✅ STOCK RECOVERED";
      detail = event.product_name + " — current stock: " + event.stock;
    } else if (event.event_type === "out") {
      heading = "🚨 OUT OF STOCK";
      detail = event.product_name + " — current stock: 0";
    } else {
      heading = "⚠️ LOW STOCK";
      detail = event.product_name + " — remaining: " + event.stock;
    }

    const response = await fetchImpl("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "📦 FOODORA STOCK ALERT\n\n" + heading + "\n" + detail,
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(8000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.description || "Telegram stock alert failed");
  }

  async function deliverPending(limit = 20) {
    let delivered = 0;
    for (let i = 0; i < limit; i++) {
      const client = await pool.connect();
      let event;
      try {
        await client.query("BEGIN");
        const claimed = await client.query(`
          WITH candidate AS (
            SELECT id FROM assistant_stock_alert_outbox
            WHERE delivered_at IS NULL
              AND next_attempt_at <= NOW()
              AND (locked_until IS NULL OR locked_until < NOW())
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE assistant_stock_alert_outbox AS q
          SET locked_until = NOW() + INTERVAL '1 minute'
          FROM candidate
          WHERE q.id = candidate.id
          RETURNING q.*
        `);
        event = claimed.rows[0];
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      if (!event) break;

      try {
        await sendTelegram(event);
        await pool.query(
          "UPDATE assistant_stock_alert_outbox SET delivered_at=NOW(), locked_until=NULL, last_error=NULL WHERE id=$1 AND delivered_at IS NULL",
          [event.id]
        );
        delivered++;
      } catch (error) {
        const attempts = Number(event.attempts || 0) + 1;
        const delay = Math.min(RETRY_BASE_MS * (2 ** Math.min(attempts - 1, 5)), RETRY_MAX_MS);
        await pool.query(
          `UPDATE assistant_stock_alert_outbox
           SET attempts=$2, next_attempt_at=NOW()+($3 * INTERVAL '1 millisecond'),
               locked_until=NULL, last_error=$4
           WHERE id=$1 AND delivered_at IS NULL`,
          [event.id, attempts, delay, String(error.message || "Delivery failed").slice(0, 300)]
        );
        logger.error("Foodora Telegram stock alert delivery failed:", error.message);
        break;
      }
    }
    return delivered;
  }

  async function pollOnce() {
    if (running) return { skipped: true, reason: "already-running" };
    running = true;
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('foodora_stock_alert_worker'))");
      const products = await client.query(
        "SELECT id, name, stock FROM products WHERE active = TRUE ORDER BY id"
      );
      const prior = await client.query("SELECT product_id, stock_state FROM assistant_stock_alert_state");
      const previousById = new Map(prior.rows.map(row => [row.product_id, row]));
      let queued = 0;

      for (const product of products.rows) {
        const stock = Math.max(0, Number(product.stock) || 0);
        const currentState = stockState(stock);
        const previous = previousById.get(product.id);
        const eventType = transitionFor(previous && previous.stock_state, currentState);
        if (eventType) {
          await client.query(
            `INSERT INTO assistant_stock_alert_outbox(id,product_id,product_name,event_type,stock)
             VALUES($1,$2,$3,$4,$5)`,
            [randomUUID(), product.id, String(product.name || "Unnamed product").slice(0, 120), eventType, stock]
          );
          queued++;
        }
        await client.query(
          `INSERT INTO assistant_stock_alert_state(product_id,product_name,stock_state,stock,updated_at)
           VALUES($1,$2,$3,$4,NOW())
           ON CONFLICT(product_id) DO UPDATE SET product_name=EXCLUDED.product_name,
             stock_state=EXCLUDED.stock_state,stock=EXCLUDED.stock,updated_at=NOW()`,
          [product.id, String(product.name || "Unnamed product").slice(0, 120), currentState, stock]
        );
      }
      await client.query("COMMIT");
      const delivered = await deliverPending();
      return { checked: products.rows.length, queued, delivered };
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      logger.error("Foodora stock alert poll failed:", error.message);
      throw error;
    } finally {
      if (client) client.release();
      running = false;
    }
  }

  function start() {
    if (timer) return;
    pollOnce().catch(() => {});
    timer = setInterval(() => pollOnce().catch(() => {}), POLL_INTERVAL_MS);
    if (typeof timer.unref === "function") timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { ensureSchema, pollOnce, deliverPending, start, stop };
}

module.exports = {
  LOW_STOCK_THRESHOLD,
  stockState,
  transitionFor,
  createStockAlertWorker
};
