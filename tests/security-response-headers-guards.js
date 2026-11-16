"use strict";
const fs = require("node:fs");
const source = fs.readFileSync("server.js", "utf8");
const checks = [
  'res.setHeader("X-Content-Type-Options", "nosniff")',
  'res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")',
  'res.setHeader("X-Frame-Options", "DENY")',
  'res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")',
  'res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains")',
  'req.path.startsWith("/api/admin/") || req.path.startsWith("/api/customer/")',
  'res.setHeader("Cache-Control", "no-store")'
];
for (const item of checks) if (!source.includes(item)) throw new Error("Missing response security control: " + item);
console.log("Baseline response security headers and private API no-store policy are present.");
