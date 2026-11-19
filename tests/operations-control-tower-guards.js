const fs=require("node:fs"),assert=require("node:assert/strict");
const html=fs.readFileSync("operations.html","utf8"),js=fs.readFileSync("operations.js","utf8"),server=fs.readFileSync("server.js","utf8");
assert.match(html,/Operations Control Tower/);assert.match(html,/operations\.js/);
assert.match(js,/x-admin-key/);assert.match(js,/\/api\/admin\/orders/);assert.match(js,/setInterval\(\(\)=>\{if\(!\$\("#dashboard"\)\.hidden\)refresh\(\)\},10000\)/);
assert.match(js,/ETA overdue/);assert.match(js,/foodora_ops_admin_key/);assert.doesNotMatch(js,/phone|address/i);
assert.match(server,/app\.get\("\/api\/admin\/orders",adminOnly/);assert.match(server,/app\.patch\("\/api\/admin\/orders\/:id",adminOnly/);
console.log("Operations Control Tower safety and integration guards passed.");