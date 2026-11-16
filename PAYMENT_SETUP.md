# Foodora V6 — Manual bKash/Nagad Payment Setup

## Scope

This release supports **manual payment submission and human verification** only. It is not a payment gateway and does not automatically verify transfers.

## Account eligibility

Before displaying any receiving number to customers, the business owner or an authorized adult representative must confirm directly with bKash and Nagad that the specific account type is permitted to receive the business's customer payments. A personal account must not be represented as a merchant gateway or used for commercial collection if the provider's terms do not permit it.

Do not put PINs, OTPs, passwords, app credentials, or account access tokens in this repository, browser code, or Render environment variables.

## Render configuration

Set these environment variables only after account eligibility and ownership are confirmed:

- `BKASH_NUMBER`: approved bKash receiving number
- `NAGAD_NUMBER`: approved Nagad receiving number
- `PAYMENT_METHODS`: `bKash,Nagad`
- `DATABASE_URL`: the existing PostgreSQL connection string
- `ADMIN_KEY`: a strong, private admin secret

Do not commit actual receiving numbers or secrets to Git.

## Customer flow

1. Customer selects bKash or Nagad.
2. Foodora displays the configured receiving number and amount.
3. Customer completes the transfer in the official provider app.
4. Customer submits the transaction ID.
5. Foodora stores the order as `Pending verification`.
6. An administrator checks the actual incoming transaction in the provider's official app or statement, confirms the exact amount and reference, then approves or rejects it in Admin.

A transaction ID submitted by a customer is **not proof of payment**. Never auto-mark an order as paid based only on a client-side success message, screenshot, or transaction ID.

## Duplicate protection

The server checks transaction IDs per payment method. PostgreSQL requests serialize checks with a transaction-scoped advisory lock to prevent concurrent duplicate submissions. The JSON fallback performs a best-effort duplicate check and is not recommended for production multi-instance use.

## Testing

Use test orders and a separate non-production database first. Verify:
- missing or malformed transaction ID is rejected;
- duplicate transaction ID is rejected;
- a new transaction remains pending;
- admin approval succeeds only after manual external verification;
- admin rejection records the review event;
- COD remains unaffected;
- old orders and payment-review history remain readable.

## Important limitation

Without an approved provider API or merchant collection integration, payment verification remains manual. No automatic confirmation, refunds, or reconciliation are claimed by this module.