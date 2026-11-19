"use strict";
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8080";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });
const id = "CUS_EVT_TEST_" + Date.now();
const phone = "01700000000";
const origin = base;

(async () => {
  const controller = new AbortController();
  let reader;
  try {
    const badOrigin = await fetch(base + "/api/customer/events/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.invalid" },
      body: JSON.stringify({ orderId: id, phone })
    });
    assert.equal(badOrigin.status, 403, "ticket endpoint must reject cross-origin requests");

    await pool.query(
      "INSERT INTO orders(id,customer_name,phone,address,payment_method,items,subtotal,total,status,payment_status) VALUES($1,'CI Customer',$2,'PRIVATE CI ADDRESS','COD','[]'::jsonb,100,100,'Pending','Awaiting payment')",
      [id, phone]
    );
    const ticketResponse = await fetch(base + "/api/customer/events/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ orderId: id, phone })
    });
    assert.equal(ticketResponse.status, 200, "verified customer must receive a short-lived stream ticket");
    const ticketData = await ticketResponse.json();
    assert.match(ticketData.ticket || "", /^[a-f0-9]{64}$/);
    assert.equal(ticketData.expiresIn, 600);

    const denied = await fetch(base + "/api/customer/events/stream?ticket=" + "0".repeat(64));
    assert.equal(denied.status, 401, "stream must reject an invalid ticket");

    const response = await fetch(base + "/api/customer/events/stream?ticket=" + encodeURIComponent(ticketData.ticket), {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
    reader = response.body.getReader();

    await pool.query("UPDATE orders SET status='Confirmed',payment_status='Verified' WHERE id=$1", [id]);
    let received = "";
    const deadline = Date.now() + 5000;
    while (!received.includes("event: order.update") && Date.now() < deadline) {
      const next = await Promise.race([
        reader.read(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for customer order event")), Math.max(1, deadline - Date.now())))
      ]);
      if (next.done) break;
      received += new TextDecoder().decode(next.value);
    }
    assert.match(received, /event: order\.update/);
    const frame = received.split("\n\n").find(part => part.includes("event: order.update"));
    assert(frame, "customer stream must emit a complete event frame");
    const payloadLine = frame.split("\n").find(line => line.startsWith("data: "));
    const payload = JSON.parse(payloadLine.slice(6));
    assert.equal(payload.orderId, id);
    assert.equal(payload.status, "Confirmed");
    assert.equal(payload.paymentStatus, "Verified");
    assert.equal(received.includes(phone), false, "customer stream must not expose checkout phone");
    assert.equal(received.includes("PRIVATE CI ADDRESS"), false, "customer stream must not expose delivery address");
    assert.equal(received.includes("CI Customer"), false, "customer stream must not expose customer name");

    console.log("Customer order SSE E2E passed: same-origin ticket issuance, invalid-ticket rejection, verified order stream, status updates, and PII minimization.");
  } finally {
    controller.abort();
    if (reader) await reader.cancel().catch(() => {});
    await pool.query("DELETE FROM orders WHERE id=$1", [id]).catch(() => {});
    await pool.end();
  }
})().catch(error => { console.error(error); process.exit(1); });
