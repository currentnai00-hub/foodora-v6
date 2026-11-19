"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
const worker = fs.readFileSync("sw.js", "utf8");
const installer = fs.readFileSync("app-pwa.js", "utf8");
const offline = fs.readFileSync("offline.html", "utf8");
const home = fs.readFileSync("index.html", "utf8");

assert.equal(manifest.name, "Foodora — খাবার অর্ডার");
assert.equal(manifest.start_url, "/?source=pwa");
assert.equal(manifest.scope, "/");
assert.equal(manifest.display, "standalone");
assert.ok(manifest.icons.some(icon => icon.purpose === "any"));
assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));

for (const required of ["/api/", "/admin", "/account", "/checkout", "/wallet"]) {
  assert.ok(worker.includes(required), "Service worker must exclude " + required);
}
assert.ok(worker.includes('request.method !== "GET"'), "Only GET requests may be considered for caching");
assert.ok(worker.includes('url.origin !== self.location.origin'), "Cross-origin requests must bypass the cache");
assert.ok(worker.includes('url.pathname === "/"'), "Only the public homepage may be stored as a navigation shell");
assert.ok(worker.includes('"/offline.html"'), "Offline navigation fallback must exist");
assert.ok(!worker.includes("caches.open(.*api"), "API responses must not be cached");
assert.ok(installer.includes("beforeinstallprompt"), "Supported browsers should expose the install prompt");
assert.ok(installer.includes('register("/sw.js"'), "PWA service worker must be registered");
assert.ok(home.includes('rel="manifest" href="/manifest.webmanifest"'), "Homepage must link the manifest");
assert.ok(home.includes('src="/app-pwa.js?v=1"'), "Homepage must load PWA bootstrap");
assert.ok(offline.includes("অর্ডার, পেমেন্ট ও অ্যাকাউন্টের তথ্য অফলাইনে সংরক্ষণ করা হয় না"), "Offline page must explain sensitive flows remain online-only");

for (const iconPath of ["icons/foodora-icon.svg", "icons/foodora-maskable.svg"]) {
  assert.ok(fs.existsSync(iconPath), "Missing app icon: " + iconPath);
}
console.log("Foodora PWA manifest, install, offline and cache-safety checks passed.");
