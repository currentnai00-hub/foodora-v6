"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "homepage-voice-welcome.js"), "utf8");
const css = fs.readFileSync(path.join(root, "homepage-voice-welcome.css"), "utf8");
const intro = fs.readFileSync(path.join(root, "homepage-entry-intro.js"), "utf8");

test("homepage includes the accessible recorded-audio welcome controls", () => {
  assert.match(html, /id="fdVoiceWelcome"/);
  assert.match(html, /data-voice-audio/);
  assert.match(html, /\/audio\/foodora-welcome-bn\.mp3/);
  assert.match(html, /data-voice-play/);
  assert.match(html, /data-voice-mute/);
  assert.match(html, /homepage-voice-welcome\.js/);
  assert.match(html, /homepage-voice-welcome\.css/);
});

test("welcome uses a real audio element and never falls back to robotic browser speech", () => {
  assert.match(js, /audio\.play\(\)/);
  assert.match(js, /audio\.pause\(\)/);
  assert.match(js, /audio\.muted = muted/);
  assert.match(js, /audio\.addEventListener\("ended"/);
  assert.doesNotMatch(js, /SpeechSynthesisUtterance|speechSynthesis/);
});

test("welcome waits for the visual intro and respects first-visit state", () => {
  assert.match(intro, /foodora:intro:finished/);
  assert.match(js, /foodora:intro:finished/);
  assert.match(js, /foodora_voice_welcome_seen_v4/);
  assert.match(js, /visibilitychange/);
});

test("voice controls remain keyboard accessible and support reduced motion", () => {
  assert.match(html, /aria-label="Foodora voice welcome"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});
