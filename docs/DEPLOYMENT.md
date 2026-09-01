# Theeb production deployment

This phase keeps Theeb as one codebase with separately deployed roles. It does not create cloud resources, spend money, or store credentials.

## Target topology

- Cloud Run: public `api` role, scale to zero supported.
- Oracle Cloud/VPS: `health-worker` and `refresh-worker` containers managed by systemd.
- PostgreSQL: shared source of truth with certificate verification.
- Cloud Run Job: one-shot, non-retrying database migrations before an API revision receives traffic.

## Mandatory preflight

1. Complete runtime repository parity for PostgreSQL. The current database guard intentionally rejects PostgreSQL for SQLite-only services.
2. Store `DATABASE_URL` in the platform secret manager or a root-owned `0600` file. Never commit it.
3. Replace every uppercase placeholder in `deploy/`.
4. Build immutable images and reference digests, not mutable `latest` tags.
5. Run `npm test` and build all Docker targets.
6. Run `npm run deploy:validate` in the final environment.

`POSTGRES_RUNTIME_PARITY=verified` is an explicit release gate, not a bypass. Do not set it until the API, workers and repository tests have run against the target PostgreSQL version. The current SQLite-backed runtime guard will still reject PostgreSQL until that repository migration is complete; therefore these templates are not evidence that production is ready.

## Release order

1. Take and verify a PostgreSQL backup using `docs/POSTGRES_BACKUP_RESTORE.md`.
2. Deploy or replace `deploy/cloud-run/migration.job.yaml`.
3. Execute the migration job once and require exit code zero.
4. Deploy `deploy/cloud-run/api.service.yaml` without shifting all traffic immediately.
5. Verify `/livez`, `/readyz`, logs, and a smoke search/playback request.
6. Shift traffic gradually. Roll back the revision if the acceptance checks fail.
7. Install both worker units on the VPS and verify their structured startup logs.

Cloud Run startup uses `/readyz`; liveness uses `/livez`. During SIGTERM the API first fails readiness, stops accepting new connections, drains existing HTTP requests, closes PostgreSQL, and then exits. Its shutdown budget is kept below Cloud Run's termination window. Workers stop polling when aborted and finish the currently claimed job under its lease.

The API returns playback metadata and controlled identifiers only. It is not a video proxy and the deployment must not route arbitrary user-supplied URLs through the service.

## Rollback

- API: route traffic to the prior known-good revision.
- Workers: pin the prior image digest and restart the unit.
- Database: prefer forward-fix migrations. Restore only after an explicit incident decision because restoration discards newer writes.

## Scope boundary

The manifests are deployment templates, not an automatic production launch. They deliberately contain no project IDs, domains, tokens, database passwords, or paid resources.
