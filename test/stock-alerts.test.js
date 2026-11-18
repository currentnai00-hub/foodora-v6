"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { stockState, transitionFor, LOW_STOCK_THRESHOLD } = require("../stock-alerts");

test("stock levels use the five-unit threshold", () => {
  assert.equal(LOW_STOCK_THRESHOLD, 5);
  assert.equal(stockState(0), "out");
  assert.equal(stockState(1), "low");
  assert.equal(stockState(5), "low");
  assert.equal(stockState(6), "healthy");
});

test("new unhealthy products and worsening stock create one alert transition", () => {
  assert.equal(transitionFor(null, "low"), "low");
  assert.equal(transitionFor(null, "out"), "out");
  assert.equal(transitionFor("healthy", "low"), "low");
  assert.equal(transitionFor("low", "out"), "out");
  assert.equal(transitionFor("out", "out"), null);
  assert.equal(transitionFor("low", "low"), null);
});

test("recovery is reported only when stock returns above threshold", () => {
  assert.equal(transitionFor("low", "healthy"), "recovered");
  assert.equal(transitionFor("out", "healthy"), "recovered");
  assert.equal(transitionFor("out", "low"), null);
  assert.equal(transitionFor("healthy", "healthy"), null);
});
