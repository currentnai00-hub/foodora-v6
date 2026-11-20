"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "homepage-voice-welcome.js"), "utf8");
const css = fs.readFileSync(path.join(root, "homepage-voice-welcome.css"), "utf8");

test("homepage includes the accessible voice welcome controls and assets", () => {
  assert.match(html, /id="fdVoiceWelcome"/);
  assert.match(html, /data-voice-play/);
  assert.match(html, /data-voice-mute/);
  assert.match(html, /homepage-voice-welcome\.js/);
  assert.match(html, /homepage-voice-welcome\.css/);
});

test("welcome is one continuous Bengali utterance with the requested greeting and wording", () => {
  assert.match(js, /আসসালামু আলাইকুম ওয়া রাহমাতুল্লাহি ওয়া বারাকাতুহু/);
  assert.match(js, /আমাদের ওয়েবসাইটে আপনাকে আন্তরিক স্বাগতম/);
  assert.match(js, /আপনার পছন্দের খাবারটি বেছে নিতে মেনু ঘুরে দেখুন/);
  assert.match(js, /const utterance = new SpeechSynthesisUtterance\(welcomeText\)/);
  assert.match(js, /utterance\.lang = voice \? voice\.lang : "bn-BD"/);
  assert.match(js, /utterance\.rate = 0\.96/);
  assert.doesNotMatch(js, /ফুডোরা ওয়েবসাইট/);
  assert.doesNotMatch(js, /lang: "ar"/);
  assert.doesNotMatch(js, /speakLine\(index \+ 1/);
});

test("voice welcome respects browser gesture fallback, session state and interruption", () => {
  assert.match(js, /speechSynthesis/);
  assert.match(js, /needs-gesture/);
  assert.match(js, /sessionStorage/);
  assert.match(js, /speechSynthesis\.cancel\(\)/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /utterance\.pitch = 1/);
});

test("voice controls remain keyboard accessible and support reduced motion", () => {
  assert.match(html, /aria-label="Foodora voice welcome"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});
