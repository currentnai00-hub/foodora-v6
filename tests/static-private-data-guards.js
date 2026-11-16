"use strict";
const fs = require("node:fs");
const source = fs.readFileSync("server.js", "utf8");
const guardStart = source.indexOf("Never expose server-side data");
const staticStart = source.indexOf('app.use(express.static(ROOT, { extensions: ["html"] }));');
if (guardStart < 0 || staticStart < 0 || guardStart > staticStart) {
  throw new Error("Private static-file guard must run before express.static.");
}
for (const marker of [
  'normalized.startsWith("data/")',
  'orders|users|sessions|products|coupons|reviews',
  'backup|dump|sql|zip',
  'res.status(404).end()'
]) {
  if (!source.includes(marker)) throw new Error("Missing private-file protection: " + marker);
}
console.log("Static private-data exposure guards are present and ordered before express.static.");
