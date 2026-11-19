"use strict";
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8080";
const adminKey = process.env.ADMIN_KEY;
const databaseUrl = process.env.DATABASE_URL;
if (!adminKey || !databaseUrl) throw new Error("ADMIN_KEY and DATABASE_URL are required");

(async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const id = "EVT_TEST_" + Date.now();
  const controller = new AbortController();
  let reader;
  try {
    const denied = await fetch(base + "/api/admin/events/stream");
    assert.equal(denied.status, 401, "stream must reject unauthenticated access");
    const before = await pool.query("SELECT COALESCE(MAX(id),0)::text AS id FROM order_event_outbox");
    const response = await fetch(base + "/api/admin/events/stream", {
      headers: { "x-admin-key": adminKey, "last-event-id": before.rows[0].id },
      signal: controller.signal
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
    reader = response.body.getReader();

    await pool.query(
      "INSERT INTO orders(id,customer_name,phone,address,payment_method,items,subtotal,total,status,payment_status) VALUES($1,'CI Event','01700000000','CI only','COD','[]'::jsonb,100,100,'Pending','Awaiting payment')",
      [id]
    );
    await pool.query("UPDATE orders SET status='Confirmed',payment_status='Verified' WHERE id=$1", [id]);

    let received = "";
    const deadline = Date.now() + 5000;
    while (!received.includes("event: payment.status_changed") && Date.now() < deadline) {
      const next = await Promise.race([
        reader.read(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for SSE events")), Math.max(1, deadline - Date.now())))
      ]);
      if (next.done) break;
      received += new TextDecoder().decode(next.value);
      if (received.includes("event: payment.status_changed")) break;
    }
    assert.match(received, /event: order\.created/);
    assert.match(received, /event: order\.status_changed/);
    assert.match(received, /event: payment\.status_changed/);
    assert.equal(received.includes("01700000000"), false, "stream must not expose phone numbers");
    assert.equal(received.includes("CI only"), false, "stream must not expose delivery addresses");

    const events = await pool.query(
      "SELECT event_type,payload FROM order_event_outbox WHERE order_id=$1 ORDER BY id",
      [id]
    );
    assert.deepEqual(events.rows.map(row => row.event_type), ["order.created","order.status_changed","payment.status_changed"]);
    assert.equal(events.rows[1].payload.status, "Confirmed");
    await pool.query("DELETE FROM orders WHERE id=$1", [id]);
    console.log("PostgreSQL realtime SSE + outbox E2E passed.");
  } finally {
    controller.abort();
    if (reader) await reader.cancel().catch(() => {});
    await pool.query("DELETE FROM orders WHERE id=$1", [id]).catch(() => {});
    await pool.end();
  }
})().catch(error => { console.error(error); process.exit(1); });
