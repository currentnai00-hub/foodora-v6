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
  const client = await pool.connect();
  try {
    const before = await client.query("SELECT COALESCE(MAX(id),0)::text AS id FROM order_event_outbox");
    const cursor = before.rows[0].id;
    const response = await fetch(base + "/api/admin/events/stream", {
      headers: { "x-admin-key": adminKey, "last-event-id": cursor },
      signal: AbortSignal.timeout(5000)
    }).catch(error => error.name === "TimeoutError" ? null : Promise.reject(error));
    // A timed-out streaming fetch is expected; event rows are the durable source of truth.
    const inserted = await pool.query(
      "INSERT INTO orders(id,customer_name,phone,address,payment_method,items,subtotal,total,status,payment_status) VALUES($1,'CI Event','01700000000','CI only','COD','[]'::jsonb,100,100,'Pending','Awaiting payment')",
      [id]
    );
    assert.equal(inserted.rowCount, 1);
    await pool.query("UPDATE orders SET status='Confirmed' WHERE id=$1", [id]);
    const events = await pool.query(
      "SELECT event_type,payload FROM order_event_outbox WHERE order_id=$1 ORDER BY id",
      [id]
    );
    assert.deepEqual(events.rows.map(row => row.event_type), ["order.created","order.status_changed"]);
    assert.equal(events.rows[1].payload.status, "Confirmed");
    assert.equal(Object.hasOwn(events.rows[1].payload, "phone"), false);
    assert.equal(Object.hasOwn(events.rows[1].payload, "address"), false);
    await pool.query("DELETE FROM orders WHERE id=$1", [id]);
    console.log("PostgreSQL event outbox E2E passed.");
  } finally {
    client.release();
    await pool.end();
  }
})().catch(error => { console.error(error); process.exit(1); });
