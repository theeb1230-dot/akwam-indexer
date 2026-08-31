# ADR-002 — PostgreSQL Migration

- Status: In progress
- Date: 2026-08-31

## Decision

SQLite remains the default local-development backend. PostgreSQL becomes the production source of truth only after every runtime repository has an asynchronous PostgreSQL implementation and parity tests.

Setting `DATABASE_URL` before that gate fails closed instead of silently writing to a different local SQLite database.

## Safety rules

- TLS certificate verification is enabled by default.
- Temporary direct media URLs are not columns in the production schema.
- Worker claims use `FOR UPDATE SKIP LOCKED` and bounded leases.
- Active job deduplication is enforced by a partial unique index.
- Migrations are versioned, ordered and idempotent.
- Production migration requires a backup plus a dry run against a restored copy.
- No destructive rollback is automated; forward fixes are preferred after data migration.

## Rollout gates

1. Create and validate the PostgreSQL schema.
2. Add repository contracts and PostgreSQL implementations.
3. Add SQLite-to-PostgreSQL export/import with counts and checksums.
4. Run fresh-database, existing-database and restart tests.
5. Run API and workers against the same staging PostgreSQL database.
6. Verify lease recovery with two worker instances.
7. Switch production only after backup and acceptance report.
