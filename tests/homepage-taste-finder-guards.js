"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("homepage-taste-finder.css", "utf8");
const js = fs.readFileSync("homepage-taste-finder.js", "utf8");
assert.match(html, /id="tasteFinder"/, "Homepage must expose the taste finder");
for (const preset of ["mild", "hot", "breakfast", "popular", "surprise"]) {
  assert.match(html, new RegExp('data-taste-preset="' + preset + '"'), "Missing taste preset: " + preset);
}
assert.match(html, /homepage-taste-finder\.js/, "Taste finder controller must be loaded");
assert.match(js, /clearCurrentFilters/, "Taste presets must start from a clean filter state");
assert.match(js, /prefers-reduced-motion/, "Menu navigation must respect reduced motion");
assert.match(js, /#products \.product/, "Surprise choice must use actual rendered menu items");
assert.match(js, /\.add:disabled/, "Surprise choice must exclude unavailable products");
assert.match(js, /নিজেই কার্টে যোগ করুন/, "Surprise must not silently add items to cart");
assert.match(css, /@media\(prefers-reduced-motion:reduce\)/, "Taste finder must respect reduced motion");
assert.match(css, /:focus-visible/, "Taste finder controls must have visible keyboard focus");
console.log("Homepage taste finder guards passed.");
