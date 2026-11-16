"use strict";
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const base = "http://127.0.0.1:8080";
const adminKey = process.env.ADMIN_KEY;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function api(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { "x-admin-key": adminKey, ...(options.headers || {}) }
  });
  return response;
}
async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await api("/api/health");
      if (r.status === 200) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Foodora did not become healthy on the isolated PostgreSQL test database.");
}

(async () => {
  try {
    assert(adminKey, "ADMIN_KEY is required for the isolated E2E test");
    await waitForServer();

    // Capture an existing product row, then download and validate a real ZIP
    // through the same authenticated endpoints used by the Backup Center UI.
    const beforeResult = await pool.query(
      "SELECT id, stock, price, name FROM products ORDER BY id LIMIT 1"
    );
    assert.equal(beforeResult.rowCount, 1, "The isolated test database must contain a product");
    const before = beforeResult.rows[0];

    const backupResponse = await api("/api/admin/backups", { method: "POST" });
    assert.equal(backupResponse.status, 200, "Backup endpoint must return a ZIP");
    assert.match(backupResponse.headers.get("content-type") || "", /application\/zip/i);
    const archive = Buffer.from(await backupResponse.arrayBuffer());
    assert(archive.length > 22, "Downloaded ZIP archive must not be empty");

    const validationResponse = await api("/api/admin/backups/validate", {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: archive
    });
    const validation = await validationResponse.json();
    assert.equal(validationResponse.status, 200, "The downloaded ZIP must validate");
    assert.equal(validation.valid, true);
    assert(validation.tableCount > 0);
    assert(validation.rowCount > 0);

    // Mutate a real row only in the ephemeral GitHub Actions PostgreSQL service.
    await pool.query("UPDATE products SET stock = stock + 7 WHERE id = $1", [before.id]);
    const mutated = await pool.query("SELECT stock FROM products WHERE id = $1", [before.id]);
    assert.equal(Number(mutated.rows[0].stock), Number(before.stock) + 7,
      "Test mutation must be visible before restore");

    const restoreResponse = await api("/api/admin/backups/restore", {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: archive
    });
    const restored = await restoreResponse.json();
    assert.equal(restoreResponse.status, 200,
      "Restore endpoint must restore the previously validated ZIP: " + JSON.stringify(restored));
    assert.equal(restored.ok, true);

    const afterResult = await pool.query(
      "SELECT id, stock, price, name FROM products WHERE id = $1", [before.id]
    );
    assert.equal(afterResult.rowCount, 1, "Restored product must exist");
    assert.equal(Number(afterResult.rows[0].stock), Number(before.stock),
      "Restore must recover the original stock value");
    assert.equal(Number(afterResult.rows[0].price), Number(before.price),
      "Restore must recover the original price value");
    assert.equal(afterResult.rows[0].name, before.name,
      "Restore must recover the original product name");

    const history = await pool.query(
      "SELECT COUNT(*)::int AS count FROM foodora_backup_history WHERE backup_id LIKE 'fd_pre_%'"
    );
    assert(history.rows[0].count >= 1,
      "A pre-restore safety snapshot must be recorded in backup history");

    console.log("PostgreSQL ZIP backup/restore E2E passed: authenticated ZIP download, ZIP validation, isolated DB mutation, restore, exact row-value verification, and pre-restore snapshot history.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
