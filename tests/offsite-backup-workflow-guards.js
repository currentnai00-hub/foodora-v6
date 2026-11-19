"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const workflow = fs.readFileSync(".github/workflows/foodora-offsite-backup.yml", "utf8");
const jobStart = workflow.indexOf("  backup:");
assert.notEqual(jobStart, -1, "off-site backup job must exist");
const job = workflow.slice(jobStart);

assert.match(workflow, /^permissions:\s*\n\s+contents:\s+read\s*$/m,
  "workflow must use read-only repository permissions");
assert.match(job, /if:\s*vars\.FOODORA_OFFSITE_BACKUP_ENABLED\s*==\s*'true'/,
  "backup job must be explicitly disabled unless its feature flag is true");
assert.match(job, /timeout-minutes:\s*30/,
  "backup job must have a bounded runtime");
assert.match(job, /umask 077/,
  "temporary backup files must be owner-only");
assert.match(job, /trap 'rm -rf "\$WORK"' EXIT/,
  "temporary working directory must be removed on exit");
assert.match(job, /pg_dump "\$DATABASE_URL" --format=custom[^\n]*--file "\$WORK\/foodora\.dump"/,
  "database dump must use the expected custom format and temporary path");
assert.match(job, /age --encrypt --recipient "\$AGE_RECIPIENT" --output "\$WORK\/foodora\.dump\.age" "\$WORK\/foodora\.dump"/,
  "database dump must be encrypted with age before upload");
assert.match(job, /rm -f "\$WORK\/foodora\.dump"/,
  "plaintext dump must be deleted after encryption");
assert.match(job, /sha256sum "\$WORK\/foodora\.dump\.age" > "\$WORK\/foodora\.dump\.age\.sha256"/,
  "checksum must cover the encrypted archive");
assert.ok(job.includes('"sha256":"%s"') &&
  job.includes("cut -d' ' -f1") &&
  job.includes('foodora.dump.age.sha256'),
  "manifest must record the encrypted archive checksum");

const encryptAt = job.indexOf("age --encrypt");
const plaintextDeleteAt = job.indexOf('rm -f "$WORK/foodora.dump"');
const checksumAt = job.indexOf('sha256sum "$WORK/foodora.dump.age"');
const firstUploadAt = job.indexOf("aws s3 cp");
assert.ok(encryptAt >= 0 && plaintextDeleteAt > encryptAt && checksumAt > plaintextDeleteAt && firstUploadAt > checksumAt,
  "encryption, plaintext deletion and checksum must all happen before any object upload");
assert.doesNotMatch(job, /aws s3 cp[^\n]*foodora\.dump[" ]/,
  "plaintext database dump must never be uploaded");
assert.match(job, /latest\.dump\.age/,
  "encrypted latest backup pointer must be uploaded");
assert.match(job, /latest\.manifest\.json/,
  "latest backup manifest must be uploaded");

console.log("Off-site backup security invariants passed.");
