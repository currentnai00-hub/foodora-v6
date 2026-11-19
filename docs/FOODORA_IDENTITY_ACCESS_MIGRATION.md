# Foodora Identity & Access — Phase 1

## Legacy contract audit
The Node application implements customer register/login/logout/profile/order-history routes under `/api/customer/*`. It stores customer credentials in `customers` (unique phone, scrypt salt/hash) and hashed opaque sessions in `customer_sessions`; customer sessions last 30 days and use an HttpOnly SameSite=Lax cookie. Delivery partners use separate `delivery_partners` and `delivery_partner_sessions` tables with 12-hour sessions. Admin currently uses a shared `ADMIN_KEY` request header. These are distinct trust boundaries.

## Java phase 1
The Java service provides versioned customer endpoints at `/api/v1/auth/*`, using a dedicated `platform_identity` schema, BCrypt password hashes, random 256-bit opaque session tokens and SHA-256 hashes at rest. Registration assigns CUSTOMER only. Cookie is HttpOnly, SameSite=Lax, and Secure is configurable for HTTPS deployment.

## Deliberate non-goals
- No legacy credential import or scrypt-to-BCrypt conversion.
- No shared cookie/session interpretation between Node and Java.
- No seller, delivery-partner, support or admin self-registration.
- No modification to legacy customers, orders or sessions.
- No checkout, payment, inventory or production traffic routing change.

## Cutover gates
1. Design duplicate-phone/account-linking and historical order ownership reconciliation.
2. Choose a verified credential adapter or forced password reset for legacy users.
3. Build resumable, checksummed migration with row-level outcomes.
4. Add distributed login rate limits, anomaly monitoring, session revocation and audit events.
5. Complete API contract and authorization matrix tests.
6. Canary traffic gradually and retain a tested rollback path.
This Java slice is functional in isolation; it is not yet the production identity authority for existing Foodora customers.
