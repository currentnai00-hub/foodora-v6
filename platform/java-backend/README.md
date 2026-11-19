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

Bangladesh mobile numbers must use `01XXXXXXXXX`; passwords are 12–128 characters. Public registration can only create CUSTOMER accounts.

Sessions use 256-bit random tokens. Only SHA-256 token hashes are stored. Passwords use BCrypt. Cookies are HttpOnly, SameSite=Lax and Secure when `FOODORA_COOKIE_SECURE=true`. Enable Secure behind production HTTPS.

## Data ownership

Flyway creates a separate `platform_identity` schema. No legacy customer records are copied or modified and no dual writes occur. Existing Node sessions are not accepted by Java. Account linking, password migration/reset, order ownership reconciliation and a canary cutover must be reviewed before customer traffic is switched.

## Tests

`mvn --batch-mode verify` uses an isolated in-memory H2 database; it does not connect to production.

## Vendor onboarding & store management API v1

- `POST /api/v1/vendor/applications` — authenticated customer submits one vendor application.
- `GET /api/v1/vendor/applications/me` — reads the caller's application status.
- `GET /api/v1/admin/vendor/applications` — ADMIN-only pending application queue.
- `POST /api/v1/admin/vendor/applications/{id}/approve` — ADMIN-only approval; atomically creates an ACTIVE store and OWNER membership.
- `POST /api/v1/admin/vendor/applications/{id}/reject` — ADMIN-only rejection with an optional review note.
- `GET /api/v1/vendor/stores/me` — lists only stores where the caller has an active membership.
- `PUT /api/v1/vendor/stores/{storeId}` — OWNER/MANAGER-only store profile update; inaccessible store IDs return 404.

### Authorization boundaries

Vendor permissions are scoped to `store_memberships`, not inferred from a client-supplied role or a global VENDOR flag. Public registration still creates CUSTOMER only. ADMIN is a privileged platform role and must be provisioned through a separately controlled operator process; there is no public admin-registration endpoint. A user with no active store membership cannot read or update another vendor's store.

Each account may submit one application in this foundation. Approval is transactional: the application status, store, and OWNER membership are committed together. A unique application-to-store relationship and membership primary key prevent duplicate store creation.

### Browser CSRF flow

First call `GET /api/v1/auth/csrf`, then send the returned `XSRF-TOKEN` cookie value in `X-XSRF-TOKEN` for state-changing requests. Keep the session cookie HttpOnly; do not expose it to JavaScript.

## Vendor integration tests

The vendor integration suite uses only the test profile's isolated H2 database. It covers pending application workflow, ADMIN-only review, store creation, owner access, duplicate applications, and cross-account store isolation. No production database or legacy Node tables are used.
