# Java Cart and Checkout Workflow

## Scope

This increment adds persistent, customer-owned carts and a single-store checkout flow to the Java platform. It does not replace the existing Node.js application and does not implement payment collection, delivery pricing, dispatch, cancellation, refunds, or production data migration.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/stores/{storeId}/carts` | Create a cart for an active store |
| GET | `/api/v1/carts/{cartId}` | Read the signed-in customer's cart |
| POST | `/api/v1/carts/{cartId}/items` | Add quantity of a variant |
| PUT | `/api/v1/carts/{cartId}/items/{itemId}` | Set item quantity |
| DELETE | `/api/v1/carts/{cartId}/items/{itemId}` | Remove an item |
| POST | `/api/v1/carts/{cartId}/checkout` | Create an order and reserve stock |
| GET | `/api/v1/orders/{orderId}` | Read an order owned by the customer |

All mutating requests require the existing CSRF cookie/header and a valid customer session. Checkout additionally requires a UUID `Idempotency-Key`.

## Invariants

- A cart belongs to exactly one customer and one store; cart access is owner-scoped.
- Checkout is single-store only.
- Only ACTIVE stores, ACTIVE products, and active variants can be checked out.
- The server reads current prices and stock; client-supplied prices are never accepted.
- Money is stored as integer BDT minor units.
- Checkout locks the customer, cart, and relevant inventory rows, rechecks availability, and reserves stock in the same transaction that creates the order.
- Order items retain product, variant, SKU, and unit-price snapshots.
- A customer-scoped idempotency key prevents duplicate orders from retries.
- A checked-out cart cannot be modified.
- Orders begin in `AWAITING_PAYMENT`; this is not evidence of payment. Payment verification remains a separate workflow.
- Delivery fee is currently explicitly zero until a server-side delivery pricing policy is implemented.

## Test safety

Integration tests run against the isolated H2 test database and clean dependent records in foreign-key order. They cover cart ownership, stock reservation, price snapshots, checkout idempotency, and insufficient-stock rollback. No production database or live customer data is used.

A disposable PostgreSQL migration and concurrency test is still required before any production rollout.
