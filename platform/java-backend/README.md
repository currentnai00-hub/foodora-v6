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
