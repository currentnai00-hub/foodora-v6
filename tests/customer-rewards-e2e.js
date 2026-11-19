"use strict";
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const crypto = require("node:crypto");

const base = "http://127.0.0.1:8080";
const adminKey = process.env.ADMIN_KEY;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { "content-type": "application/json", origin: base, ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body, headers: response.headers };
}
function admin(path, method = "GET", body) {
  return request(path, {
    method,
    headers: { "x-admin-key": adminKey },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}
async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const result = await request("/api/health");
      if (result.status === 200 && result.body.database === "postgresql") return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Foodora did not become healthy on the isolated PostgreSQL database.");
}

(async () => {
  try {
    await waitForServer();
    const phone = "01" + String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0");
    const registration = await request("/api/customer/register", {
      method: "POST",
      body: JSON.stringify({ name: "CI Reward Customer", phone, password: "CI-only-reward-password" })
    });
    assert.equal(registration.status, 201, JSON.stringify(registration.body));
    const cookie = registration.headers.get("set-cookie")?.split(";")[0];
    assert(cookie, "Reward customer session cookie should be issued");
    const customer = await request("/api/customer/me", { headers: { cookie } });
    assert.equal(customer.status, 200);
    const customerId = customer.body.customer.id;

    const unauthenticated = await request("/api/customer/rewards");
    assert.equal(unauthenticated.status, 401, "Reward progress must require an authenticated customer account");

    const initialSettings = await admin("/api/admin/customer-reward-settings");
    assert.equal(initialSettings.status, 200);
    assert.equal(initialSettings.body.spendThreshold, 5000);
    assert.equal(initialSettings.body.maxItemValue, 500);

    const settingsUpdate = await admin("/api/admin/customer-reward-settings", "PUT", {
      enabled: true, spendThreshold: 5000, maxItemValue: 500
    });
    assert.equal(settingsUpdate.status, 200);

    const config = await request("/api/config");
    assert.equal(config.status, 200);
    assert(config.body.areas?.length, "Reward test needs an active delivery area");

    const productId = "ci_reward_" + crypto.randomBytes(5).toString("hex");
    const product = await admin("/api/admin/products", "POST", {
      id: productId, name: "CI Reward Food", category: "CI Test", price: 450,
      stock: 5, emoji: "🍽️", description: "CI-only reward item", active: true
    });
    assert.equal(product.status, 201, JSON.stringify(product.body));

    const noRewardYet = await request("/api/customer/rewards/redeem", {
      method: "POST", headers: { cookie },
      body: JSON.stringify({ productId, deliveryArea: config.body.areas[0].id, address: "CI-only address" })
    });
    assert.equal(noRewardYet.status, 409, "A customer must not redeem before reaching the purchase threshold");

    const expensiveProductId = "ci_reward_over_cap_" + crypto.randomBytes(5).toString("hex");
    const expensiveProduct = await admin("/api/admin/products", "POST", {
      id: expensiveProductId, name: "CI Reward Over Cap", category: "CI Test", price: 600,
      stock: 5, emoji: "🍽️", description: "CI-only ineligible reward item", active: true
    });
    assert.equal(expensiveProduct.status, 201, JSON.stringify(expensiveProduct.body));

    for (const amount of [2500, 2500]) {
      const orderId = "CI_REWARD_" + crypto.randomBytes(6).toString("hex");
      await pool.query(
        `INSERT INTO orders(id,customer_name,phone,address,payment_method,transaction_id,payment_status,status,items,subtotal,discount,delivery_fee,total,coupon_code,customer_id)
         VALUES($1,'CI Reward Customer',$2,'CI test address','bKash',$3,'Verified','Delivered','[]'::jsonb,$4,0,0,$4,'',$5)`,
        [orderId, phone, "CI_TX_" + crypto.randomBytes(6).toString("hex"), amount, customerId]
      );
    }

    const progress = await request("/api/customer/rewards", { headers: { cookie } });
    assert.equal(progress.status, 200, JSON.stringify(progress.body));
    assert.equal(progress.body.qualifyingSpend, 5000, "Separate successful orders must accumulate to the configured threshold");
    assert.equal(progress.body.availableRewards, 1, "Exactly one reward should be earned at ৳5,000");
    assert(progress.body.products.some(item => item.id === productId), "Eligible food under the maximum price should be selectable");
    assert(!progress.body.products.some(item => item.id === expensiveProductId), "Food above the configured cap must not be offered");

    const overCap = await request("/api/customer/rewards/redeem", {
      method: "POST", headers: { cookie },
      body: JSON.stringify({ productId: expensiveProductId, deliveryArea: config.body.areas[0].id, address: "CI-only address" })
    });
    assert.equal(overCap.status, 409, "Server must reject a reward item above the configured value cap");

    const redemption = await request("/api/customer/rewards/redeem", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({
        productId, deliveryArea: config.body.areas[0].id,
        address: "CI-only reward delivery address"
      })
    });
    assert.equal(redemption.status, 201, JSON.stringify(redemption.body));
    assert.equal(redemption.body.order.total, 0, "Reward food order must be completely free");
    assert.equal(redemption.body.order.deliveryFee, 0, "Reward order delivery must be free");

    const stored = await pool.query(
      "SELECT subtotal,discount,delivery_fee,total,payment_method,payment_status,items FROM orders WHERE id=$1 AND customer_id=$2",
      [redemption.body.order.id, customerId]
    );
    assert.equal(stored.rowCount, 1);
    assert.equal(Number(stored.rows[0].subtotal), 0);
    assert.equal(Number(stored.rows[0].delivery_fee), 0);
    assert.equal(Number(stored.rows[0].total), 0);
    assert.equal(stored.rows[0].payment_method, "Customer Reward");
    assert.equal(stored.rows[0].payment_status, "Verified");
    assert.equal(stored.rows[0].items[0].price, 0);
    assert.equal(stored.rows[0].items[0].reward, true);

    const afterRedemption = await request("/api/customer/rewards", { headers: { cookie } });
    assert.equal(afterRedemption.body.availableRewards, 0, "A reward must not be redeemed twice");
    const secondAttempt = await request("/api/customer/rewards/redeem", {
      method: "POST", headers: { cookie },
      body: JSON.stringify({ productId, deliveryArea: config.body.areas[0].id, address: "CI-only address" })
    });
    assert.equal(secondAttempt.status, 409, "No reward should remain after a successful redemption");

    const cancelled = await admin("/api/admin/orders/" + encodeURIComponent(redemption.body.order.id), "PATCH", { status: "Cancelled" });
    assert.equal(cancelled.status, 200, "Cancelled reward order should release its claim and stock");
    const restored = await request("/api/customer/rewards", { headers: { cookie } });
    assert.equal(restored.body.availableRewards, 1, "Cancelling a reward order should restore the reward claim");

    const invalidSettings = await admin("/api/admin/customer-reward-settings", "PUT", {
      enabled: true, spendThreshold: 0, maxItemValue: 500
    });
    assert.equal(invalidSettings.status, 400, "Admin must not be able to save an invalid threshold");

    console.log("Customer cumulative purchase reward E2E checks passed.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
