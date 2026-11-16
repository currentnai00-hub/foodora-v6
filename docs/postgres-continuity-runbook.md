# Foodora PostgreSQL continuity and migration runbook

## Current environment checked 2026-11-16

- Render database: `foodora-v6-db`, PostgreSQL 18.6, Oregon, Free plan.
- Render-reported expiry: **2026-12-07 01:25:57 UTC**.
- Approximate database size: 8.8 MiB.
- Public tables observed: `site_settings`, `products`, `orders`, `coupons`, `reviews`, `customers`, `customer_sessions`, `payment_review_events`, `wallet_accounts`, `wallet_topups`, `wallet_transactions`, `wallet_refund_cases`, `foodora_backup_history`.
- Approximate point-in-time counts: 42 orders, 18 products, 1 customer, 4 wallet ledger entries, 1 backup-history record.
- Core schema is created in `server.js:initDb()`; wallet schema in `wallet.js:ensureWalletSchema()`; backup schema in `backup.js:ensureSchema()`. These use idempotent create/alter statements rather than a numbered migration ledger.

## Target

Move to durable PostgreSQL before the Free database expiry. Prefer PostgreSQL 18 in the same region when practical. Confirm destination retention, backups, region, connection limits, and price before provisioning. Do not assume a Free resource is durable or cost-free indefinitely.

## Phase 1 — Prepare without production writes

1. Select destination provider/plan after confirming cost and retention.
2. Provision a separate destination/test database; do not point production at it.
3. Capture a source schema inventory and baseline row counts for every table.
4. Take a native PostgreSQL custom-format dump with `pg_dump --format=custom --no-owner --no-acl`.
5. Encrypt before external storage; keep the private encryption key offline.
6. Restore only into the destination/test database. Inspect with `pg_restore --list`; verify schema, row counts, indexes, constraints, and sequences.
7. Run PostgreSQL E2E tests against an isolated database, including checkout, payment-review simulation, wallet ledger invariants, and cancellation/refund idempotency.
8. Do not use the in-app ZIP as the only migration artifact: it stores JSON table rows and its backup history is in the same database, rather than being a native PostgreSQL dump.

## Phase 2 — Cutover rehearsal

1. Rehearse restore and app boot against the destination using a separate test service/environment.
2. Verify required environment variables are present without exposing their values: `DATABASE_URL`, `ADMIN_KEY`, payment configuration, and optional Telegram notification configuration.
3. Verify health, customer login, product listing, test checkout, payment review simulation, wallet invariants, order status updates, and admin backup page.
4. Compare table counts and critical totals with the source baseline; check foreign-key integrity and sequence positions.
5. Document rollback target and exact service/environment switch steps.

## Phase 3 — Production cutover (controlled window)

This phase changes production routing and must be scheduled deliberately.

1. Announce a maintenance window and temporarily stop accepting new orders.
2. Ensure no checkout, payment review, wallet top-up approval, or order mutation is in flight.
3. Take a final encrypted native dump from the source.
4. Restore to destination; verify checksum, row counts, constraints, and sequence positions.
5. Update production Render `DATABASE_URL` through protected settings. Never place connection strings in Git.
6. Restart/deploy and verify health plus read-only business checks before reopening orders.
7. Keep the old database untouched for a rollback window, subject to expiry/provider terms. Do not delete it until the new DB and a separate backup are verified.

## Rollback

If health or data checks fail, stop new order intake and restore the previous production `DATABASE_URL`. Do not improvise reverse sync after new writes have occurred. Reconcile any cutover-window orders before reopening.

## Current blockers

- Destination provider/plan is not selected or provisioned.
- Encrypted R2 workflow is prepared in PR #51 but awaits bucket and GitHub Actions variables/secrets.
- Do not broadly weaken the database IP allow-list for GitHub-hosted runners. Prefer a safe provider-supported route or controlled runner network.
- Production restore/cutover has not been run. Rehearsals must use an isolated database.

## Safety rules

- Never run restore tests against production.
- Never log or commit database URLs, admin keys, payment credentials, Telegram tokens, or encryption private keys.
- Never switch production before isolated restore, E2E tests, and data comparisons pass.
- A green app deploy alone does not prove migration correctness.
