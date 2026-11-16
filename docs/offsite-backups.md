# Foodora off-site backup operations

## Purpose

The application Backup Center creates a ZIP for a person to download and currently keeps snapshot history in the same PostgreSQL database. That is useful for convenience, but it is not an independent disaster-recovery copy. This workflow creates a PostgreSQL custom-format dump, encrypts it locally with age, and uploads only the encrypted archive plus checksum/manifest to a separate Cloudflare R2 bucket.

The workflow does not run database restore, alter production data, or change Render billing/plans.

## One-time setup required

Create a private Cloudflare R2 bucket dedicated to Foodora backups. Create an R2 API token limited to **Object Read & Write** for that bucket only. Do not use an account-wide token.

Generate an age keypair on a trusted device:
```sh
age-keygen -o foodora-backup-agekey.txt
```
Keep the private key (the line beginning `AGE-SECRET-KEY-`) offline and secure. Never add it to GitHub, this repository, Render, or a chat. The public recipient (the `age1...` line) is safe to store as a GitHub Actions variable.

Add these repository settings under **Settings → Secrets and variables → Actions**:

### Variables
- `FOODORA_AGE_RECIPIENT`: the age public recipient (`age1...`)
- `FOODORA_R2_ACCOUNT_ID`: Cloudflare account ID
- `FOODORA_R2_BUCKET`: exact bucket name

### Secrets
- `FOODORA_DATABASE_URL`: Render PostgreSQL external connection URL (treat as a password; never paste it into source code)
- `FOODORA_R2_ACCESS_KEY_ID`: R2 access key ID
- `FOODORA_R2_SECRET_ACCESS_KEY`: R2 secret access key

Use the Render database's external connection URL from its dashboard. Keep the database IP allow-list as restrictive as your deployment and runner access allow; GitHub-hosted runner IP ranges change, so do not casually open the database to the entire internet just for this workflow. If a safe network path is unavailable, use a self-hosted/controlled runner or a provider-native backup route instead.

## Schedule and retention

GitHub Actions runs this workflow daily at 03:20 UTC and supports a manual run. The workflow writes timestamped objects and a `latest` copy under `foodora/`. Configure an R2 lifecycle rule for this bucket/prefix to retain daily backups for an agreed period (for example 30–90 days) and then expire older timestamped objects. Do not expire `latest.*` objects. Enable bucket-level protections available on your account and monitor GitHub Actions failure notifications.

## Recovery procedure (manual, controlled)

1. Retrieve the encrypted archive and verify its SHA-256 sidecar.
2. Decrypt on a trusted machine using the offline age private key:
   `age --decrypt -i foodora-backup-agekey.txt -o foodora.dump foodora.dump.age`
3. Inspect the archive with `pg_restore --list foodora.dump`.
4. Restore only into a separately created, isolated PostgreSQL database first. Validate schema, row counts, key application flows, and referential integrity.
5. Production cutover requires a separate reviewed migration plan and explicit approval. Never test restore against production.

## Current limitation

The scheduled workflow cannot successfully connect until the GitHub Actions variables/secrets above are configured. This repository change intentionally does not invent credentials or weaken the database network allow-list. The Render PostgreSQL instance currently reports Free plan expiry on **2026-12-07**; arrange a database continuity/migration decision before that date. This backup workflow alone does not extend the database's lifetime.
