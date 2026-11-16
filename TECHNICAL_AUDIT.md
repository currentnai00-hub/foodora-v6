# Foodora V6 Technical Audit — Initial Findings

Audit scope: public repository source on the `main` branch, reviewed on 2026-11-16. This is a source-code review, not a live penetration test, production database inspection, or provider-side payment test.

## Confirmed finding

### F-01 — Server-side JSON and backup files were eligible for static hosting
- Severity: High
- Evidence: `server.js` registered `express.static(ROOT)` for the entire repository root. The root contains server-side JSON files such as `orders.json`, `users.json`, and `sessions.json`, plus backup/archive artifacts.
- Risk: If requested directly by URL, operational or customer-related data and backup files could be disclosed outside the intended API authorization controls.
- Remediation in this audit branch: add a request guard before static hosting that returns 404 for the `data/` directory, sensitive JSON filenames, backup/dump/SQL/ZIP artifacts, and `.env` files.
- Verification: add a CI static guard that checks the deny rule exists and executes before `express.static`. A live HTTP browser test remains recommended.

## Existing safeguards observed

- Admin API routes use an `x-admin-key` check with constant-time comparison.
- Customer wallet and account endpoints use customer-session checks.
- Payment setup documentation clearly states that bKash/Nagad are manual verification only, not an automatic gateway.
- Payment duplicate handling, PostgreSQL E2E tests, ZIP integrity tests, and isolated restore rollback tests already exist.
- ZIP restore is documented for isolated test/staging databases only; production restore must not be used for QA.

## Important audit limitations / follow-up checks

1. Run authenticated and unauthenticated browser tests against a disposable PostgreSQL database.
2. Review every API route for ownership checks, authorization consistency, request validation, and rate limits.
3. Review HTML output sinks and user-generated content for XSS, including product/review/admin interfaces.
4. Review HTTP security headers, CSP, cookie/session flags, CSRF/origin validation, and proxy assumptions.
5. Review order pricing and stock mutation for transaction safety and concurrent checkout races.
6. Review wallet top-up/refund workflows and ensure ledger idempotency and admin review boundaries.
7. Review backup ZIP central-directory validation, retention, and backup-data access controls.
8. Verify production environment configuration and database recovery options without reading or changing secrets.
9. Run performance, accessibility, mobile layout, and SEO checks.
10. Verify live deployment and production behavior only with safe read-only checks; never test restore or destructive actions on production.

## Release policy

All changes must go through pull requests and CI. Do not merge or deploy automatically. Do not run destructive tests against production. Real payment integration requires an approved merchant/provider API and an eligible account.
