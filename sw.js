"use strict";
const CACHE_VERSION = "foodora-shell-v1";
const SHELL_CACHE = CACHE_VERSION + "-shell";
const ASSET_CACHE = CACHE_VERSION + "-assets";
const SHELL_URLS = ["/", "/offline.html"];
const STATIC_ASSETS = [
  "/style.css?v=foodora-payment-v3",
  "/script.js?v=foodora-payment-v3",
  "/customer-support.css?v=2",
  "/customer-support.js?v=2",
  "/icons/foodora-icon.svg"
];
const PRIVATE_PREFIXES = ["/api/", "/admin", "/account", "/checkout", "/wallet", "/backup"];
const NEVER_CACHE = /\.(?:json|dump|sql|zip|backup)$/i;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL_URLS);
    const assets = await caches.open(ASSET_CACHE);
    await Promise.all(STATIC_ASSETS.map(async url => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok && response.type === "basic") await assets.put(url, response);
      } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => ![SHELL_CACHE, ASSET_CACHE].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + "/")) ||
    pathname.startsWith("/api/") || NEVER_CACHE.test(pathname);
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivatePath(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && url.pathname === "/") {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put("/", response.clone());
        }
        return response;
      } catch (_) {
        const cache = await caches.open(SHELL_CACHE);
        if (url.pathname === "/") return (await cache.match("/")) || (await cache.match("/offline.html"));
        return (await cache.match("/offline.html"));
      }
    })());
    return;
  }

  const isStatic = STATIC_ASSETS.some(asset => new URL(asset, self.location.origin).pathname === url.pathname);
  if (!isStatic && !/\.(?:svg|png|webp|avif|woff2?)$/i.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return new Response("", { status: 503, statusText: "Offline" });
    }
  })());
});
