# Foodora Java Platform

Java 21 / Spring Boot modular-monolith foundation.

## Run locally

Requires Java 21 and PostgreSQL.

```bash
export FOODORA_JDBC_URL='jdbc:postgresql://localhost:5432/foodora_platform'
export FOODORA_DB_USER='foodora'
export FOODORA_DB_PASSWORD='change-me'
export FOODORA_COOKIE_SECURE=false
mvn spring-boot:run
```

Health: `GET /actuator/health`

## Identity & Access API v1

- `POST /api/v1/auth/register` — creates a customer account.
- `POST /api/v1/auth/login` — verifies credentials and issues an opaque session cookie.
- `GET /api/v1/auth/me` — returns the authenticated customer.
- `POST /api/v1/auth/logout` — revokes the current session.

## Vendor onboarding & store management API v1

- `POST /api/v1/vendor/applications` — authenticated customer submits one vendor application.
- `GET /api/v1/vendor/applications/me` — reads the caller's application status.
- `GET /api/v1/admin/vendor/applications` — ADMIN-only pending application queue.
- `POST /api/v1/admin/vendor/applications/{id}/approve` — ADMIN-only approval; atomically creates the store and OWNER membership.
- `POST /api/v1/admin/vendor/applications/{id}/reject` — ADMIN-only rejection.
- `GET /api/v1/vendor/stores/me` — lists only stores where the caller has an active membership.
- `PUT /api/v1/vendor/stores/{storeId}` — OWNER/MANAGER-only store profile update.

## Product Catalog & Inventory API v1

All vendor endpoints require an authenticated active OWNER or MANAGER membership for the exact store. Product and category identifiers are scoped by store at both query and database-constraint levels.

- `POST /api/v1/vendor/stores/{storeId}/categories` — create a store-owned category.
- `POST /api/v1/vendor/stores/{storeId}/products` — create a DRAFT product and its initial variant.
- `GET /api/v1/vendor/stores/{storeId}/products` — list products and variants belonging only to that store.
- `POST /api/v1/vendor/stores/{storeId}/variants/{variantId}/stock-adjustments` — append an inventory movement and update stock atomically. Requires a UUID `Idempotency-Key` header.

### Money and inventory invariants

Prices are positive integer minor units in BDT (100 poisha = ৳1); floating-point money is not accepted. New variants start with zero stock. Stock changes are recorded in an append-only movement ledger, protected by a per-store idempotency key and a row lock. On-hand stock cannot fall below reserved stock; stock cannot become negative. Reservation/checkout flows are intentionally not implemented in this phase.

New products remain DRAFT and are not exposed through a public catalog endpoint. Product moderation and customer browsing will be added after the admin review workflow is implemented.

## Tests

`mvn --batch-mode --no-transfer-progress verify` uses an isolated in-memory H2 database in PostgreSQL compatibility mode. Tests create and delete only test-profile records. Never point the test profile at production.
