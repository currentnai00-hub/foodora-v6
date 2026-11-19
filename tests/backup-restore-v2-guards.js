"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

const backup = fs.readFileSync("backup.js", "utf8");
const e2e = fs.readFileSync("tests/postgres-backup-restore-e2e.js", "utf8");

const restoreStart = backup.indexOf('app.post("/api/admin/backups/restore"');
assert.notEqual(restoreStart, -1, "Restore route must exist");
const restore = backup.slice(restoreStart);
const begin = restore.indexOf('await c.query("BEGIN")');
const advisoryLock = restore.indexOf("pg_advisory_xact_lock");
const tableLock = restore.indexOf("ACCESS EXCLUSIVE MODE");
const snapshot = restore.indexOf("const pre=await snapshot(c)");
const safetyRecord = restore.indexOf("fd_pre_");
const deletion = restore.indexOf('await c.query("DELETE FROM public."+qi(n))');

assert(begin >= 0 && advisoryLock > begin,
  "Restore must begin a transaction before acquiring its transaction-scoped advisory lock");
assert(tableLock > advisoryLock,
  "Restore must acquire deterministic exclusive application-table locks");
assert(snapshot > tableLock && safetyRecord > snapshot && deletion > snapshot,
  "The pre-restore snapshot must be captured after table locks and before any DELETE");
assert.match(backup, /snapshot\(client\)/,
  "Snapshot helper must support using the already-locked restore connection");
assert.match(backup, /t\\.table_type='BASE TABLE'/,
  "Backup validation must inventory base tables, not views");
assert.match(backup, /archive\.length>MAX_BYTES/,
  "Generated ZIP archives must respect the upload size limit");
assert.match(restore, /row-count verification failed/i,
  "Restore must verify persisted row counts before commit");
assert.match(e2e, /Pre-restore snapshot must capture the current database state/,
  "PostgreSQL E2E must verify the safety snapshot contains the pre-restore live state");
assert.match(e2e, /Failed restore must roll back DELETEs/,
  "PostgreSQL E2E must retain rollback coverage");

console.log("Backup/restore V2 guards passed: serialized restore, exclusive table locks, pre-restore snapshot ordering, ZIP size cap, and E2E coverage.");
