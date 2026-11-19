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


## Order cancellation and audit history

Customers may cancel only their own orders while the order is `AWAITING_PAYMENT`:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/orders/{orderId}/cancel` | Cancel a payment-pending order and release its stock reservation |

The cancellation is one database transaction:
- Lock the owned order and verify it is still `AWAITING_PAYMENT`.
- Lock/read the order item reservation lines.
- Decrement each matching store inventory reservation, refusing to proceed if the stored reservation is inconsistent.
- Change the order to `CANCELLED`.
- Append an immutable status event with actor, transition, reason, and timestamp.

A repeated cancellation returns a conflict and cannot release inventory twice. Orders in later states cannot be cancelled through this customer endpoint. Payment capture and refund handling are intentionally outside this workflow; no payment status is inferred.


## Manual bKash/Nagad payment review (Java API)

This is a manual review workflow, not a payment gateway. The customer submits a transaction reference; that submission is **not proof of payment**.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/v1/orders/{orderId}/payments` | Customer | Submit bKash/Nagad method and transaction ID |
| GET | `/api/v1/admin/payments/pending` | Admin | List pending submissions |
| POST | `/api/v1/admin/payments/{paymentId}/review` | Admin | Approve or reject after checking the provider's official transaction record |

The server derives the amount from the stored order total. The client cannot set or override the amount or payment status. Transaction IDs are unique case-insensitively per payment method. Submission moves the order from `AWAITING_PAYMENT` to `PAYMENT_REVIEW`; approval moves it to `CONFIRMED`, while rejection returns it to `AWAITING_PAYMENT` so a fresh transaction reference can be submitted.

Only a session whose database role is `ADMIN` can access the review queue or review action. Public registration always creates `CUSTOMER`; it cannot create an administrator. An authorized database operator must provision the initial administrator through a controlled, private database procedure. Do not expose an admin-creation endpoint or reuse the legacy Node `x-admin-key` mechanism.

No provider API, automatic verification, capture, or refund is implemented. Admins must verify the exact incoming amount and transaction reference directly in the provider's official app or statement before approving. Never approve based only on a customer screenshot or submitted transaction ID.
