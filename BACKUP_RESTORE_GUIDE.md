# Foodora Backup & Restore

## Create a ZIP backup
1. Sign in at /admin.html with the Admin Key.
2. Open Backup Center from the admin dashboard.
3. Create and download the ZIP archive.
4. Keep the ZIP private and store a second copy securely.

The ZIP contains backup.json and manifest.json. The manifest records the archive format/version, payload size and SHA-256 digest. The server validates the ZIP structure, CRC values and SHA-256 before accepting a restore.

## Restore safeguards
- Select a ZIP file and validate it before restore.
- Restore automatically creates a pre-restore snapshot in PostgreSQL backup history before changing application data.
- Restore runs in a transaction and rolls back on errors.
- Child tables are deleted before parent tables; parent tables are inserted before child tables.
- Cyclic and self-referencing foreign-key schemas are refused rather than bypassed.
- Restore resets serial sequences after inserting rows.
- Only the supported ZIP format using stored (uncompressed) entries is accepted.

## Operational limits
- Logical table-data backup only; it does not include database roles, extensions, schema migrations, or database-level settings.
- Backup history contains sensitive database snapshots; protect the Admin Key and restrict database access.
- 50 MB archive/request limit. Configure managed PostgreSQL backups or point-in-time recovery for disaster recovery.
- Environment variables, database passwords, API keys, and payment secrets are never exported.
- Test restore only against a separate staging/test database. Never experiment on production.
