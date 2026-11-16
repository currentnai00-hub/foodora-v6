const assert = require("node:assert/strict");
const { Pool } = require("pg");
const crypto = require("node:crypto");

const base = "http://127.0.0.1:8080";
const adminKey = process.env.ADMIN_KEY;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}
async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await request("/api/health");
      if (r.status === 200 && r.body.database === "postgresql") return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Foodora did not become healthy on the isolated PostgreSQL database.");
}
let checkoutFixture;
async function loadCheckoutFixture() {
  const [config, products] = await Promise.all([request("/api/config"), request("/api/products")]);
  assert.equal(config.status, 200, "Store config should load");
  assert.equal(products.status, 200, "Products should load");
  assert(config.body.areas?.length, "At least one delivery area must exist in the test database");
  const product = products.body.find(p => p.active !== false && Number(p.stock) >= 1);
  assert(product, "At least one active in-stock product must exist in the test database");
  checkoutFixture = { deliveryArea: config.body.areas[0].id, productId: product.id };
  console.log("Checkout fixture diagnostics:", JSON.stringify({
    deliveryArea: checkoutFixture.deliveryArea,
    productId: product.id,
    productStock: product.stock,
    paymentMethods: config.body.paymentMethods
  }));
}
function checkout(paymentMethod, transactionId = "") {
  return request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      name: "CI Test Customer",
      phone: "01700000000",
      address: "CI-only test address",
      deliveryArea: checkoutFixture.deliveryArea,
      paymentMethod,
      transactionId,
      items: [{ id: checkoutFixture.productId, qty: 1 }]
    })
  });
}
function admin(path, method = "GET", body) {
  return request(path, {
    method,
    headers: { "x-admin-key": adminKey },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

(async () => {
  try {
    await waitForServer();
    await loadCheckoutFixture();

    const malformed = await checkout("bKash", "x");
    assert.equal(malformed.status, 400, "Malformed transaction ID must be rejected");

    const tx = "CI" + crypto.randomBytes(8).toString("hex");
    const first = await checkout("bKash", tx);
    if (first.status !== 201) {
      console.error("Checkout API diagnostic:", JSON.stringify({
        status: first.status, body: first.body,
        paymentMethod: "bKash", transactionIdLength: tx.length,
        deliveryArea: checkoutFixture.deliveryArea, productId: checkoutFixture.productId
      }));
    }
    assert.equal(first.status, 201, `A new bKash transaction should create an order; received ${first.status}: ${JSON.stringify(first.body)}`);
    assert.equal(first.body.order.paymentStatus, "Pending verification");

    const duplicate = await checkout("bKash", tx.toLowerCase());
    assert.equal(duplicate.status, 409, "Duplicate transaction ID must be rejected case-insensitively");

    const approved = await admin(
      `/api/admin/orders/${first.body.order.id}/payment-review`,
      "PATCH",
      { action: "approve", note: "CI fixture: simulated admin review" }
    );
    assert.equal(approved.status, 200, "Admin payment approval route should work");
    assert.equal(approved.body.order.payment_status, "Verified");

    const tx2 = "CI" + crypto.randomBytes(8).toString("hex");
    const second = await checkout("Nagad", tx2);
    assert.equal(second.status, 201);
    const rejected = await admin(
      `/api/admin/orders/${second.body.order.id}/payment-review`,
      "PATCH",
      { action: "reject", note: "CI fixture: simulated rejection" }
    );
    assert.equal(rejected.status, 200, "Admin rejection route should work");
    assert.equal(rejected.body.order.payment_status, "Rejected");

    const cod = await checkout("Cash on Delivery");
    assert.equal(cod.status, 201, "COD order should still be accepted");
    assert.equal(cod.body.order.paymentStatus, "Awaiting payment");

    const history = await admin("/api/admin/payment-history");
    assert.equal(history.status, 200);
    assert(history.body.events.some(event => event.orderId === first.body.order.id && event.action === "approved"));
    assert(history.body.events.some(event => event.orderId === second.body.order.id && event.action === "rejected"));

    const index = await pool.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND indexname='orders_payment_transaction_lookup_idx'"
    );
    assert.equal(index.rowCount, 1, "Payment transaction lookup index must exist");

    const oldOrderId = "FD_CI_OLD_" + crypto.randomBytes(4).toString("hex");
    await pool.query(
      `INSERT INTO orders(id,customer_name,phone,address,payment_method,transaction_id,payment_status,status,items,subtotal,discount,delivery_fee,total)
       VALUES($1,'Legacy CI Order','01700000000','Old test address','Cash on Delivery','', 'Awaiting payment','Delivered','[]'::jsonb,100,0,0,100)`,
      [oldOrderId]
    );
    const allOrders = await admin("/api/admin/orders");
    assert.equal(allOrders.status, 200);
    assert(allOrders.body.some(order => order.id === oldOrderId), "Existing orders must remain readable");

    console.log("PostgreSQL payment E2E passed: malformed ID, duplicate guard, pending status, approve/reject, COD, history, lookup index, and legacy order visibility.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
