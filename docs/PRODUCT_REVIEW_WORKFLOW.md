# Product Review and Public Storefront

## Scope

This increment introduces a controlled publication boundary between vendor-managed catalog data and the customer-facing storefront. Product creation remains private and creates products in `DRAFT`. No product becomes publicly visible until an authenticated platform administrator approves it.

## State transitions

- `DRAFT -> PENDING_REVIEW`: an active store OWNER or MANAGER submits the product.
- `REJECTED -> PENDING_REVIEW`: an active store OWNER or MANAGER corrects the product outside this increment and resubmits it.
- `PENDING_REVIEW -> ACTIVE`: an ADMIN approves the product.
- `PENDING_REVIEW -> REJECTED`: an ADMIN rejects the product with a reason.

All transitions are transactional and append an immutable row to `platform_identity.product_status_events`. Concurrent or repeated review actions are serialized with row locks and invalid transitions return HTTP 409.

## API

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/v1/vendor/stores/{storeId}/products/{productId}/submit-for-review` | Active store OWNER/MANAGER |
| GET | `/api/v1/admin/products/pending-review` | ADMIN |
| POST | `/api/v1/admin/products/{productId}/approve` | ADMIN |
| POST | `/api/v1/admin/products/{productId}/reject` | ADMIN; JSON body contains a required 3–500 character `note` |
| GET | `/api/v1/stores/{storeId}/products` | Public; returns ACTIVE products from an ACTIVE store only |

All state-changing browser requests continue to require the existing CSRF cookie/header flow.

## Safety properties

- Public catalog reads are explicitly allow-listed; all other API routes remain authenticated by default.
- Vendor submission checks active membership for the exact store and product.
- Admin routes use both method-level role authorization and a service-layer ADMIN check.
- Review writes lock the product row and update status plus audit history in one transaction.
- Public reads filter by active store, active variant, and `ACTIVE` product status.
- Prices remain integer BDT minor units; no floating-point money is introduced.
- This increment does not create carts, orders, payments, production data migration, or production database writes.

## Verification

The integration suite uses the isolated H2 PostgreSQL-compatibility profile. A disposable real-PostgreSQL migration/integration run remains a pre-production release gate.
