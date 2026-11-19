"use strict";
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const base = "http://127.0.0.1:8080";
const adminKey = process.env.ADMIN_KEY;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function api(path, options = {}) {
  return fetch(base + path, {
    ...options,
    headers: { "x-admin-key": adminKey, ...(options.headers || {}) }
  });
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
async function tableCounts() {
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
      AND table_name <> 'foodora_backup_history'
    ORDER BY table_name
  `);
  const counts = {};
  for (const { table_name } of tables.rows) {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM public."' +
      table_name.replace(/"/g, '""') + '"');
    counts[table_name] = result.rows[0].count;
  }
  return counts;
}
async function jsonResponse(response) {
  const body = await response.text();
  try { return JSON.parse(body); }
  catch { throw new Error("Expected JSON response, received: " + body.slice(0, 500)); }
}

(async () => {
  let triggerInstalled = false;
  try {
    assert(adminKey, "ADMIN_KEY is required for the isolated E2E test");
    await waitForServer();

    const beforeResult = await pool.query(
      "SELECT id, stock, price, name FROM products ORDER BY id LIMIT 1"
    );
    assert.equal(beforeResult.rowCount, 1, "The isolated test database must contain a product");
    const before = beforeResult.rows[0];
    const countsBefore = await tableCounts();

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
    const validation = await jsonResponse(validationResponse);
    assert.equal(validationResponse.status, 200, "Downloaded ZIP must validate");
    assert.equal(validation.valid, true);
    assert.equal(validation.tableCount, Object.keys(countsBefore).length);
    assert.equal(validation.rowCount, Object.values(countsBefore).reduce((a, b) => a + b, 0));

    // Verify transactional rollback: force a restore INSERT to fail after DELETEs
    // have begun. The failed request must leave the mutated live data untouched.
    await pool.query(`
      CREATE OR REPLACE FUNCTION ci_reject_foodora_restore() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'intentional CI restore rollback probe'; END;
      $$;
      CREATE TRIGGER ci_reject_foodora_restore
      BEFORE INSERT ON products FOR EACH ROW
      EXECUTE FUNCTION ci_reject_foodora_restore();
    `);
    triggerInstalled = true;
    await pool.query("UPDATE products SET stock = stock + 7 WHERE id = $1", [before.id]);

    const failedRestoreResponse = await api("/api/admin/backups/restore", {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: archive
    });
    const failedRestore = await jsonResponse(failedRestoreResponse);
    assert.equal(failedRestoreResponse.status, 400,
      "Intentional restore failure must be reported as a client-safe restore error");
    assert.match(failedRestore.error || "", /intentional CI restore rollback probe/);
    const afterRollback = await pool.query("SELECT stock FROM products WHERE id = $1", [before.id]);
    assert.equal(Number(afterRollback.rows[0].stock), Number(before.stock) + 7,
      "Failed restore must roll back DELETEs and preserve the mutated product row");
    assert.deepEqual(await tableCounts(), {
      ...countsBefore,
      products: countsBefore.products
    }, "Failed restore must preserve every application table row count");

    await pool.query("DROP TRIGGER ci_reject_foodora_restore ON products");
    await pool.query("DROP FUNCTION ci_reject_foodora_restore()");
    triggerInstalled = false;

    // Verify a trigger that silently suppresses restored rows cannot commit.
    await pool.query(`
      CREATE OR REPLACE FUNCTION ci_skip_foodora_restore_row() RETURNS trigger
      LANGUAGE plpgsql AS $
      BEGIN RETURN NULL; END;
      $;
      CREATE TRIGGER ci_skip_foodora_restore_row
      BEFORE INSERT ON products FOR EACH ROW
      EXECUTE FUNCTION ci_skip_foodora_restore_row();
    `);
    const skippedRowRestoreResponse = await api("/api/admin/backups/restore", {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: archive
    });
    const skippedRowRestore = await jsonResponse(skippedRowRestoreResponse);
    assert.equal(skippedRowRestoreResponse.status, 400,
      "Restore must refuse to commit when a trigger silently skips rows");
    assert.match(skippedRowRestore.error || "", /row-count verification failed/i);
    const afterSkippedRestore = await pool.query("SELECT stock FROM products WHERE id = $1", [before.id]);
    assert.equal(Number(afterSkippedRestore.rows[0].stock), Number(before.stock) + 7,
      "Row-count mismatch must roll back and preserve pre-restore data");
    assert.deepEqual(await tableCounts(), countsBefore,
      "Row-count mismatch rollback must preserve every application table count");
    await pool.query("DROP TRIGGER ci_skip_foodora_restore_row ON products");
    await pool.query("DROP FUNCTION ci_skip_foodora_restore_row()");

    const restoreResponse = await api("/api/admin/backups/restore", {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: archive
    });
    const restored = await jsonResponse(restoreResponse);
    assert.equal(restoreResponse.status, 200,
      "Restore endpoint must restore the previously validated ZIP: " + JSON.stringify(restored));
    assert.equal(restored.ok, true);
    assert.equal(restored.restoredTables, Object.keys(countsBefore).length);
    assert.equal(restored.restoredRows, Object.values(countsBefore).reduce((a, b) => a + b, 0));

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
    assert.deepEqual(await tableCounts(), countsBefore,
      "Restore must recover exact row counts for every application table");

    // Verify every restored FK has no orphaned references.
    const foreignKeys = await pool.query(`
      SELECT tc.table_name AS child_table, kcu.column_name AS child_column,
             ccu.table_name AS parent_table, ccu.column_name AS parent_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema
      WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
        AND ccu.table_schema='public' AND tc.table_name <> 'foodora_backup_history'
    `);
    for (const fk of foreignKeys.rows) {
      const orphan = await pool.query(
        'SELECT COUNT(*)::int AS count FROM public."' + fk.child_table.replace(/"/g, '""') +
        '" c LEFT JOIN public."' + fk.parent_table.replace(/"/g, '""') +
        '" p ON c."' + fk.child_column.replace(/"/g, '""') + '" = p."' +
        fk.parent_column.replace(/"/g, '""') + '" WHERE c."' +
        fk.child_column.replace(/"/g, '""') + '" IS NOT NULL AND p."' +
        fk.parent_column.replace(/"/g, '""') + '" IS NULL'
      );
      assert.equal(orphan.rows[0].count, 0,
        "Restored foreign key contains orphan rows: " + fk.child_table + "." + fk.child_column);
    }

    const history = await pool.query(
      "SELECT COUNT(*)::int AS count FROM foodora_backup_history WHERE backup_id LIKE 'fd_pre_%'"
    );
    assert(history.rows[0].count >= 2,
      "Both attempted restores must record pre-restore safety snapshots");

    console.log("PostgreSQL ZIP backup/restore E2E passed: ZIP integrity, all-table row counts, rollback after forced mid-restore failure, successful restore, FK integrity, and pre-restore snapshots.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (triggerInstalled) {
      await pool.query("DROP TRIGGER IF EXISTS ci_reject_foodora_restore ON products").catch(() => {});
      await pool.query("DROP FUNCTION IF EXISTS ci_reject_foodora_restore()").catch(() => {});
    }
    await pool.query("DROP TRIGGER IF EXISTS ci_skip_foodora_restore_row ON products").catch(() => {});
    await pool.query("DROP FUNCTION IF EXISTS ci_skip_foodora_restore_row()").catch(() => {});
    await pool.end();
  }
})();
