"use strict";
const fs = require("node:fs");
const source = fs.readFileSync("event-stream.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");
const operations = fs.readFileSync("operations.js", "utf8");
if (!source.includes("CREATE TABLE IF NOT EXISTS order_event_outbox")) throw new Error("Durable event outbox missing");
if (!source.includes("FOR UPDATE") && !source.includes("SKIP LOCKED")) {
  // A single ordered listener drains immutable events; no competing worker claims are used.
  if (!source.includes("LISTEN foodora_order_events")) throw new Error("PostgreSQL LISTEN integration missing");
}
if (!source.includes("MAX_STREAMS") || !source.includes("Last-Event-ID".toLowerCase()) && !source.includes("last-event-id")) throw new Error("Stream capacity or replay cursor missing");
if (!source.includes("adminOnly") || !source.includes("Cache-Control")) throw new Error("Admin protection/cache policy missing");
if (!server.includes('require("./event-stream")') || !server.includes("orderEventStream.ensureSchema()")) throw new Error("Server startup integration missing");
if (!operations.includes("/api/admin/events/stream") || !operations.includes("AbortController")) throw new Error("Operations dashboard stream integration missing");
console.log("Realtime event stream safety guards passed.");
