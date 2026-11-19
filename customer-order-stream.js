"use strict";

const crypto = require("crypto");
const MAX_CUSTOMER_STREAMS = 100;
const MAX_TICKET_ATTEMPT_IPS = 10000;
const TICKET_TTL_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 20000;

function registerCustomerOrderStream({ app, pool }) {
  const tickets = new Map();
  const ticketAttempts = new Map();
  let activeStreams = 0;

  function pruneTickets() {
    const now = Date.now();
    for (const [key, value] of tickets) {
      if (value.expiresAt <= now) tickets.delete(key);
    }
  }

  function pruneTicketAttempts(now = Date.now()) {
    for (const [ip, attempt] of ticketAttempts) {
      if (now - attempt.startedAt >= 60 * 1000) ticketAttempts.delete(ip);
    }
    // Keep the in-memory limiter bounded even when requests arrive from many IPs.
    while (ticketAttempts.size > MAX_TICKET_ATTEMPT_IPS) {
      ticketAttempts.delete(ticketAttempts.keys().next().value);
    }
  }

  function sameOrigin(req) {
    const origin = req.get("origin");
    if (!origin) return false;
    try {
      const parsed = new URL(origin);
      const expected = new URL(req.protocol + "://" + req.get("host"));
      return parsed.origin === expected.origin;
    } catch {
      return false;
    }
  }

  app.post("/api/customer/events/ticket", async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ error: "Request origin not allowed." });
    const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
    const now = Date.now();
    pruneTicketAttempts(now);
    const attempt = ticketAttempts.get(ip);
    if (attempt && now - attempt.startedAt < 60 * 1000 && attempt.count >= 20) {
      return res.status(429).json({ error: "Too many tracking attempts. Please wait a minute." });
    }
    if (!attempt || now - attempt.startedAt >= 60 * 1000) ticketAttempts.set(ip, { startedAt: now, count: 1 });
    else attempt.count += 1;
    const orderId = String(req.body.orderId || "").trim().slice(0, 60);
    const phone = String(req.body.phone || "").replace(/\D/g, "");
    if (!orderId || !/^01[0-9]{9}$/.test(phone)) {
      return res.status(400).json({ error: "Enter your Order ID and checkout phone number." });
    }
    try {
      const found = await pool.query(
        "SELECT id FROM orders WHERE LOWER(id)=LOWER($1) AND regexp_replace(phone,'[^0-9]','','g')=$2 LIMIT 1",
        [orderId, phone]
      );
      if (!found.rowCount) return res.status(404).json({ error: "Order verification failed." });
      pruneTickets();
      if (tickets.size >= 5000) return res.status(503).json({ error: "Live tracking capacity is temporarily full." });
      const ticket = crypto.randomBytes(32).toString("hex");
      tickets.set(ticket, { orderId: found.rows[0].id, expiresAt: Date.now() + TICKET_TTL_MS });
      res.set("Cache-Control", "no-store").json({ ticket, expiresIn: TICKET_TTL_MS / 1000 });
    } catch {
      res.status(503).json({ error: "Live tracking is temporarily unavailable." });
    }
  });

  app.get("/api/customer/events/stream", async (req, res) => {
    const ticket = String(req.query.ticket || "");
    if (!/^[a-f0-9]{64}$/.test(ticket)) return res.status(401).end();
    pruneTickets();
    const grant = tickets.get(ticket);
    if (!grant || grant.expiresAt <= Date.now()) return res.status(401).end();
    if (activeStreams >= MAX_CUSTOMER_STREAMS) return res.status(503).end();

    activeStreams += 1;
    let client;
    let closed = false;
    let cursor = 0;
    let chain = Promise.resolve();
    const orderId = grant.orderId;

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Referrer-Policy": "no-referrer"
    });
    res.flushHeaders?.();

    const cleanup = () => {
      if (closed) return;
      closed = true;
      activeStreams = Math.max(0, activeStreams - 1);
      clearInterval(heartbeat);
      if (client) {
        client.removeListener("notification", onNotification);
        client.query("UNLISTEN foodora_order_events").catch(() => {}).finally(() => client.release());
      }
    };
    const drain = async () => {
      if (closed) return;
      const result = await client.query(
        "SELECT id,event_type,payload FROM order_event_outbox WHERE order_id=$1 AND id>$2 ORDER BY id ASC LIMIT 50",
        [orderId, cursor]
      );
      for (const row of result.rows) {
        if (closed) break;
        cursor = Number(row.id);
        // Only the already-verified order's minimal status fields are sent.
        res.write("id: " + row.id + "\n");
        res.write("event: order.update\n");
        res.write("data: " + JSON.stringify({
          orderId: row.payload.orderId,
          status: row.payload.status,
          paymentStatus: row.payload.paymentStatus,
          eventType: row.event_type
        }) + "\n\n");
      }
    };
    const scheduleDrain = () => {
      chain = chain.then(drain).catch(err => {
        if (!closed) console.error("Customer order stream query failed:", err.message);
      });
    };
    const onNotification = message => {
      if (message.channel === "foodora_order_events") scheduleDrain();
    };
    const heartbeat = setInterval(() => {
      if (!closed) res.write(": keep-alive\n\n");
    }, HEARTBEAT_MS);
    heartbeat.unref?.();
    req.on("close", cleanup);
    res.on("close", cleanup);

    try {
      client = await pool.connect();
      if (closed) return client.release();
      client.on("notification", onNotification);
      await client.query("LISTEN foodora_order_events");
      const latest = await client.query(
        "SELECT COALESCE(MAX(id),0)::text AS id FROM order_event_outbox WHERE order_id=$1",
        [orderId]
      );
      cursor = Number(latest.rows[0].id);
      res.write("event: ready\ndata: {}\n\n");
    } catch (err) {
      console.error("Customer order stream connection failed:", err.message);
      if (!closed) res.end();
      cleanup();
    }
  });

  return { getActiveStreams: () => activeStreams };
}

module.exports = { registerCustomerOrderStream };
