# Foodora Full-Scale Marketplace — Java Architecture

Status: approved direction; foundation implementation in progress.

## 1. Product target

A multi-vendor commercial marketplace with customer web and mobile apps, seller operations, delivery operations, admin control, payment orchestration, support, analytics, and auditable finance workflows.

## 2. Technology decisions

- Core backend: Java 21 + Spring Boot.
- Backend structure: modular monolith first, with explicit domain boundaries and event-driven integration. Extract services only when scale and operational evidence justify it.
- API: versioned REST (/api/v1), OpenAPI contract, WebSocket/SSE only for appropriate live updates.
- Database: PostgreSQL; Flyway owns Java-platform schema changes.
- Cache and rate-limit coordination: Redis, introduced with measured need.
- Search: PostgreSQL search initially; OpenSearch when catalogue scale/relevance needs justify it.
- Web: preserve the current web experience during migration; evolve toward a separately deployed React/Next.js storefront and operations consoles.
- Android: native Java-compatible Android app (Kotlin may be adopted for new Android UI where useful).
- iOS: native Swift/SwiftUI app. Java is not the native iOS application language.
- Infrastructure: containerized deployment, managed PostgreSQL, object storage for media, centralized logs/metrics/traces, CI gates.

## 3. Domain modules

1. Identity & Access — customers, sellers, staff, roles, sessions, MFA and recovery.
2. Merchant — onboarding, verification, stores, locations, business hours and commission plans.
3. Catalogue — categories, products, variants, media, attributes and moderation.
4. Inventory — stock reservations, adjustments, movement ledger and concurrency control.
5. Pricing & Promotions — price lists, coupons, campaign eligibility and tax/fee calculation.
6. Cart & Checkout — quote validation, idempotent checkout and order creation.
7. Orders — state machine, cancellation/refund policy, immutable order-item snapshots.
8. Payments & Finance — provider adapters, webhook verification, payment ledger, settlement and reconciliation.
9. Delivery — assignment, dispatch, proof of delivery and partner lifecycle.
10. Reviews & Support — verified-purchase reviews, tickets and dispute history.
11. Notifications — transactional outbox, retryable delivery and user preferences.
12. Admin & Audit — scoped permissions, approvals, immutable audit records and operational controls.

## 4. Architecture rules

- Start as a modular monolith; no premature microservice fleet.
- Every module owns its domain logic and database writes. Cross-module work uses application interfaces or domain events.
- PostgreSQL transactions protect checkout, inventory reservation, payment state transitions and ledger writes.
- Use idempotency keys for checkout and provider callbacks.
- Use a transactional outbox for reliable event publication; consumers must be idempotent.
- Store money in integer minor units or fixed-precision decimal with explicit currency; never floating point.
- Store timestamps in UTC; render in the user's locale.
- Enforce tenant/store scope in every seller-facing query and authorization decision.
- Never trust client-supplied price, discount, role, stock, payment status or seller identity.
- Secrets live in the deployment secret manager, never in Git.
- Logs must redact credentials, tokens, payment details and unnecessary personal data.
- Backups must be encrypted, access-controlled, retained by policy and restore-tested only in isolated environments.

## 5. Migration strategy

The existing Node.js + Express + PostgreSQL application remains the live system during migration.

1. Inventory all routes, tables, constraints, jobs, payment flows, event streams, backup/restore behavior and external integrations.
2. Produce a canonical data dictionary and map legacy entities to the new domain model.
3. Establish API contracts and compatibility tests before moving a workflow.
4. Introduce Java modules one bounded context at a time behind routing/feature flags.
5. For each migrated workflow: shadow-read where safe, compare results, switch traffic gradually, monitor, and retain a rollback path.
6. Transfer write ownership only once; prohibit uncontrolled dual writes.
7. Migrate data with repeatable, checksummed, resumable jobs and reconciliation reports.
8. Decommission legacy paths only after usage reaches zero and rollback windows close.

## 6. Release gates

- Unit, integration, contract and end-to-end tests.
- Isolated PostgreSQL tests for transaction, locking, idempotency and recovery behavior.
- Authorization matrix tests for customer, seller, delivery partner, support and admin roles.
- Dependency and secret scanning; static analysis; security headers and API input validation.
- Load, soak and failure-recovery tests with documented SLOs.
- Observability: request IDs, structured logs, metrics, traces, alerting and runbooks.
- No production destructive test or restore exercise.

## 7. Initial audit findings

- Repository currently identifies as JavaScript and runs Express/Node.js; no Java build or native app projects were present in the audited root tree.
- Existing application includes PostgreSQL-backed features alongside legacy JSON compatibility paths. The README warns JSON mode is not production-safe on ephemeral hosting.
- Existing README says customer login is absent, while current server source includes customer and session tables; documentation and implementation need reconciliation.
- Payment setup documentation describes manual bKash/Nagad verification, not an automatic merchant gateway.
- A prior technical audit documented a static-file exposure risk and a source-level deny guard. Live HTTP verification remains a separate release check.

## 8. Immediate implementation

The first Java module is deliberately limited to a Spring Boot 3 application bootstrap, health probes and CI build. Database migrations, identity, checkout and payments will be added only after the corresponding legacy contracts and data ownership are mapped.
