"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("style.css", "utf8");
const script = fs.readFileSync("homepage-sliders.js", "utf8");

const slides = html.match(/class="hero-slide(?: is-active)?"/g) || [];
assert.equal(slides.length, 3, "Homepage must contain exactly three curated hero slides");
assert.match(html, /aria-roledescription="carousel"/, "Hero carousel must expose its role");
assert.match(html, /id="heroPause"/, "Hero carousel must provide a pause control");
assert.match(html, /id="heroPrev"/, "Hero carousel must provide previous navigation");
assert.match(html, /id="heroNext"/, "Hero carousel must provide next navigation");
assert.match(html, /id="heroDots"/, "Hero carousel must provide direct slide navigation");
assert.match(html, /homepage-sliders\.js/, "Homepage must load the slider controller");
assert.match(html, /class="chips category-track"/, "Menu categories must use the horizontal slider track");
assert.match(script, /prefers-reduced-motion/, "Slider must respect reduced-motion preferences");
assert.doesNotMatch(script, /mobileView\.matches/, "Automatic rotation must remain available on mobile");
assert.match(script, /userPaused/, "Customers must be able to pause automatic rotation");
assert.match(script, /pointerdown/, "Hero slider must support touch interaction");
assert.match(script, /aria-hidden/, "Inactive slides must be hidden from assistive technology");
assert.match(css, /\.category-track/, "Category slider styling must be present");
assert.match(css, /prefers-reduced-motion: reduce/, "Slider transitions must have a reduced-motion fallback");

console.log("Homepage slider structure, accessibility, and interaction guards passed.");
