# Foodora Backup & Restore

## Create
1. Sign in at /admin.html with the Admin Key.
2. Open /backup-center.html in the same browser session.
3. Select Create & Download Backup and store the JSON file privately in two safe locations.

## Restore
1. Download a fresh backup of the current live database first.
2. Select the backup JSON and validate it.
3. Read the validation result, then confirm both restore prompts.
4. Keep the page open until completion.

Restore uses a PostgreSQL transaction and rolls back on errors. It refuses circular foreign-key dependency schemas rather than disabling constraints.

## Limitations
- Logical table-data backup only; it does not include roles, extensions, schema migrations or database-level settings.
- Backup history stores metadata only. Actual files are downloaded to your device and are not kept on Render's ephemeral disk.
- 50 MB request limit. For disaster recovery, configure managed PostgreSQL backups or point-in-time recovery.
- Backup files contain private customer and order data. Never share them.
- Environment variables, database passwords, API keys and payment secrets are not exported.
