"use strict";

const LOW_STOCK_THRESHOLD = 5;
const POLL_INTERVAL_MS = 60_000;

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
  }

  async function sendTelegram(events) {
    const token = env.TELEGRAM_BOT_TOKEN || "";
    const chatId = env.TELEGRAM_CHAT_ID || "";
    if (!token || !chatId) {
      logger.warn("Foodora stock alerts are not sent: Telegram credentials are not configured.");
      return false;
    }
    const lines = ["📦 FOODORA STOCK ALERT", ""];
    for (const event of events) {
      if (event.type === "recovered") {
        lines.push("✅ STOCK RECOVERED", event.name + " — current stock: " + event.stock, "");
      } else if (event.type === "out") {
        lines.push("🚨 OUT OF STOCK", event.name + " — current stock: 0", "");
      } else {
        lines.push("⚠️ LOW STOCK", event.name + " — remaining: " + event.stock, "");
      }
    }
    const response = await fetchImpl("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: lines.join("\n").slice(0, 3900), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.description || "Telegram stock alert failed");
    return true;
  }

  async function pollOnce() {
    if (running) return { skipped: true, reason: "already-running" };
    running = true;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('foodora_stock_alert_worker'))");
      const products = await client.query(
        "SELECT id, name, stock FROM products WHERE active = TRUE ORDER BY id"
      );
      const prior = await client.query("SELECT product_id, product_name, stock_state FROM assistant_stock_alert_state");
      const previousById = new Map(prior.rows.map(row => [row.product_id, row]));
      const updates = [];
      const events = [];

      for (const product of products.rows) {
        const currentState = stockState(product.stock);
        const previous = previousById.get(product.id);
        const eventType = transitionFor(previous && previous.stock_state, currentState);
        updates.push({
          id: product.id,
          name: String(product.name || "Unnamed product").slice(0, 120),
          stock: Math.max(0, Number(product.stock) || 0),
          state: currentState
        });
        if (eventType) {
          events.push({
            type: eventType,
            name: String(product.name || "Unnamed product").slice(0, 120),
            stock: Math.max(0, Number(product.stock) || 0)
          });
        }
      }

      if (events.length) await sendTelegram(events);
      for (const item of updates) {
        await client.query(
          `INSERT INTO assistant_stock_alert_state(product_id,product_name,stock_state,stock,updated_at)
           VALUES($1,$2,$3,$4,NOW())
           ON CONFLICT(product_id) DO UPDATE SET product_name=EXCLUDED.product_name,
             stock_state=EXCLUDED.stock_state,stock=EXCLUDED.stock,updated_at=NOW()`,
          [item.id, item.name, item.state, item.stock]
        );
      }
      await client.query("COMMIT");
      return { checked: updates.length, notifications: events.length };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("Foodora stock alert poll failed:", error.message);
      throw error;
    } finally {
      client.release();
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

  return { ensureSchema, pollOnce, start, stop };
}

module.exports = {
  LOW_STOCK_THRESHOLD,
  stockState,
  transitionFor,
  createStockAlertWorker
};
