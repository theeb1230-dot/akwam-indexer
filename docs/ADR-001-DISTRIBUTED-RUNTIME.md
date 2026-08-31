# ADR-001 — Distributed Runtime Foundation

- Status: Accepted
- Date: 2026-08-31

## Decision

Theeb remains a modular monolith in one repository and one container image. Deployments select a bounded runtime role with `THEEB_ROLE`.

Target topology:

- Cloud Run: public API role.
- Oracle A1 or an authorized stable-IP VM: heavy Chromium/provider worker.
- Managed PostgreSQL: shared durable source of truth.
- PostgreSQL locks/queue first; Redis only after measured need.

## Current implementation boundary

This change implements the runtime contract and containerized API role only:

- `THEEB_ROLE=all` preserves local backward compatibility.
- `THEEB_ROLE=api` starts the current HTTP application.
- Worker role names are reserved but deliberately fail closed until PR #4 supplies real persistent jobs, leases, retries, cancellation and observability.

No deployment may advertise a worker role as healthy before its handler and contract tests exist.

## Non-decisions

- SQLite remains the local development database for now.
- PostgreSQL migration is not claimed complete.
- Redis is not required yet.
- Theeb does not proxy arbitrary user-provided URLs.
- A playback gateway is permitted only for authorized media and remains outside this milestone.

## Migration gates

1. Complete PR #3.
2. Implement background health/refresh jobs with durable leasing.
3. Add repository interfaces and PostgreSQL migrations.
4. Test fresh database and migration from an existing SQLite export.
5. Deploy API to Cloud Run with external PostgreSQL.
6. Deploy one ARM64-tested heavy worker.
7. Add another worker or region only from measured demand.

## Failure model

The API must remain useful if a worker is temporarily unavailable. Jobs must use leases and idempotency keys so another worker can recover them without duplicate side effects.
