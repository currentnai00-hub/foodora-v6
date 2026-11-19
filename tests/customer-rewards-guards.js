"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

const server = fs.readFileSync("server.js", "utf8");
const account = fs.readFileSync("account.js", "utf8");
const accountHtml = fs.readFileSync("account.html", "utf8");
const admin = fs.readFileSync("admin.html", "utf8");

assert.match(server, /DEFAULT_CUSTOMER_REWARD_SETTINGS\s*=\s*\{\s*enabled:true,\s*spendThreshold:5000,\s*maxItemValue:500\s*\}/);
assert.match(server, /CREATE TABLE IF NOT EXISTS customer_reward_redemptions/);
assert.match(server, /status='Delivered'/, "Only delivered orders may count toward purchase milestones");
assert.match(server, /payment_status='Verified' OR LOWER\(payment_method\) IN \('cash on delivery','cod'\)/);
assert.match(server, /FOR UPDATE/, "Reward redemption must serialize per-customer claims");
assert.match(server, /price<=\$2 AND stock>0 FOR UPDATE/, "Reward item price and stock must be verified by the server");
assert.match(server, /VALUES\(\$1,\$2,\$3,\$4,'Customer Reward'/);
assert.match(server, /VALUES\(\$1,\$2,\$3,\$4,\$5\)/, "A reward redemption ledger entry must be recorded");
assert.match(server, /delivery_fee,total,coupon_code,customer_id\)[\s\S]*?0,0,0,0,'CUSTOMER_REWARD'/);
assert.match(server, /app\.get\("\/api\/customer\/rewards"/);
assert.match(server, /app\.post\("\/api\/customer\/rewards\/redeem"/);
assert.match(server, /app\.put\("\/api\/admin\/customer-reward-settings"/);
assert.match(server, /Request origin not allowed/, "Reward redemption must enforce same-origin requests");
assert.match(accountHtml, /id="rewardRedeemForm"/);
assert.match(account, /\/api\/customer\/rewards\/redeem/);
assert.match(admin, /id="customerRewardForm"/);
assert.match(admin, /\/api\/admin\/customer-reward-settings/);
console.log("Customer cumulative reward safety guards passed.");
