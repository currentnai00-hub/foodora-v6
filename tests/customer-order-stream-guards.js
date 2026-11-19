"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const stream = fs.readFileSync("customer-order-stream.js", "utf8");
const tracking = fs.readFileSync("track.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");
assert.match(stream, /requestIsSameOrigin|sameOrigin/);
assert.match(stream, /crypto\.randomBytes\(32\)/);
assert.match(stream, /TICKET_TTL_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/);
assert.match(stream, /WHERE order_id=\$1 AND id>\$2/);
assert.match(stream, /paymentStatus: row\.payload\.paymentStatus/);
assert.doesNotMatch(stream, /payload\.phone|payload\.address|customer_name/);
assert.match(stream, /event_cursor/,
  "Customer ticket must capture the latest order-event cursor at verification time");
assert.match(stream, /cursor: found\.rows\[0\]\.event_cursor/,
  "Customer stream grant must retain its verification-time event cursor");
assert.match(stream, /LISTEN foodora_order_events[\s\S]*?await drain\(\)[\s\S]*?event: ready/,
  "Customer SSE must listen before replaying events from the ticket cursor");
assert.doesNotMatch(stream, /SELECT COALESCE\(MAX\(id\),0\)::text AS id FROM order_event_outbox WHERE order_id/,
  "Customer SSE must not reset its cursor to the latest event during connection setup");
assert.match(stream, /MAX_CUSTOMER_STREAMS/);
assert.match(tracking, /new EventSource\(/);
assert.match(tracking, /addEventListener\("order\.update"/);
assert.match(tracking, /startPolling\(20000\)/);
assert.match(server, /registerCustomerOrderStream/);
console.log("Customer order stream security and fallback guards passed.");
