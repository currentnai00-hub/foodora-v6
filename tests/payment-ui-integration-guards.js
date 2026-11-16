"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

const accountHtml = fs.readFileSync("account.html", "utf8");
const accountJs = fs.readFileSync("account.js", "utf8");
const guideHtml = fs.readFileSync("payment-guide.html", "utf8");
const guideJs = fs.readFileSync("payment-guide.js", "utf8");
const adminHtml = fs.readFileSync("admin.html", "utf8");
const adminJs = fs.readFileSync("admin.js", "utf8");

function ids(html) {
  return new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
}
function assertSelectorsExist(source, available, label) {
  const refs = new Set([...source.matchAll(/(?:byId\(|\$\()["']([^"']+)["']\)/g)].map(m => m[1]));
  const missing = [...refs].filter(id => !available.has(id));
  assert.deepEqual(missing, [], label + " references missing HTML IDs");
}

assertSelectorsExist(accountJs, ids(accountHtml), "Customer account UI");
assertSelectorsExist(guideJs, ids(guideHtml), "Payment guide UI");

// Customer UI must preserve manual-verification messaging and render payment review states.
assert(accountJs.includes('order.paymentStatus==="Rejected"'), "Customer account must explain rejected payment state");
assert(accountJs.includes('order.paymentStatus==="Verified"'), "Customer account must show verified payment state");
assert(accountJs.includes('order.paymentStatus==="Pending verification"'), "Customer account must show pending verification state");
assert(accountJs.includes("/api/customer/orders"), "Customer dashboard must load customer-scoped orders");
assert(accountJs.includes("credentials:\"same-origin\""), "Customer API calls must use same-origin credentials");

// Payment guide must not fabricate receiving numbers and must not claim that transaction ID alone proves payment.
assert(guideJs.includes('config.paymentNumbers'), "Payment guide must read configured receiving numbers");
assert(guideJs.includes('number==="01XXXXXXXXX"'), "Payment guide must block placeholder receiving numbers");
assert(guideJs.includes("PIN কাউকে জানাবেন না"), "Payment guide must warn customers not to share PIN");
assert(guideJs.includes("যাচাই"), "Payment guide must retain manual verification messaging");

// Admin UI must use the dedicated payment review route and warn admins to verify against provider records.
assert(adminJs.includes("/payment-review"), "Admin UI must use dedicated payment review endpoint");
assert(adminJs.includes("আসল লেনদেন"), "Admin UI must warn admins to verify actual provider transaction");
assert(adminHtml.includes("ordersTable"), "Admin page must provide the orders table");

console.log("Payment UI integration guards passed: customer selectors, payment guide selectors, manual verification messaging, configured receiving number guard, and admin review route.");
