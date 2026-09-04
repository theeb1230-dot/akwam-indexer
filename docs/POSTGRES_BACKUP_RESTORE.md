# PostgreSQL backup and restore runbook

## Backup

Use a restricted operator environment. Keep credentials outside shell history.

```sh
umask 077
PGDATABASE="$DATABASE_URL" pg_dump --format=custom --no-owner --no-acl --file=theeb-YYYYMMDD-HHMM.dump
sha256sum theeb-YYYYMMDD-HHMM.dump > theeb-YYYYMMDD-HHMM.dump.sha256
pg_restore --list theeb-YYYYMMDD-HHMM.dump > theeb-YYYYMMDD-HHMM.contents
```

Encrypt the dump at rest, copy it to a separate account/location, apply retention rules, and record the database migration version beside it. A backup is not accepted until its checksum and archive listing succeed.

The project command `npm run backup:postgres` follows the same rule and keeps the connection string out of the `pg_dump` argument list. `DATABASE_URL_FILE` is preferred on a persistent worker.

## Restore rehearsal

Never rehearse against production.

1. Create an empty, isolated PostgreSQL database.
2. Verify the checksum with `sha256sum --check`.
3. Restore with `pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" FILE.dump`.
4. Run migrations to confirm compatibility.
5. Compare table counts and canonical/playback invariants with the source report.
6. Start an isolated API against the restored database and require `/readyz` plus smoke tests.
7. Delete the rehearsal database only after the evidence is retained.

## Production restore gate

Require a declared incident owner, exact recovery point, maintenance window, write freeze, verified dump checksum, and documented approval. Preserve the damaged database for forensics. Rotate database credentials if exposure is suspected.
