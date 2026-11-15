# Foodora Backup & Restore

## Create a backup
1. Sign in at /admin.html with the Admin Key.
2. Open Backup Center in the admin navigation.
3. Create and download a database JSON backup. Keep it private and store a second copy securely.

## Restore safeguards
- Validate a backup before restore.
- Restore automatically creates a database snapshot in backup history before changing data.
- Restore runs in a transaction and rolls back on errors.
- Child tables are deleted before parent tables; parent tables are inserted before child tables.
- Cyclic and self-referencing foreign-key schemas are refused rather than bypassing constraints.
- Restore resets serial sequences after inserting rows.

## Operational limits
- Logical table-data backup only; it does not include database roles, extensions, schema migrations, or database-level settings.
- Backup history contains sensitive database snapshots; protect the Admin Key and restrict database access.
- 50 MB JSON request limit. Configure managed PostgreSQL backups or point-in-time recovery for disaster recovery.
- Environment variables, database passwords, API keys, and payment secrets are never exported.
- Test restore only against a separate staging/test database. Never experiment on production.
