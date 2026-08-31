# Stage #10 — Production Deployment

Status: implementation in progress.

Scope:
- Cloud Run API and independent worker role deployment;
- PostgreSQL migration job and backup/restore runbook;
- readiness, liveness and graceful shutdown;
- secret injection without credentials in Git;
- rollback and post-deployment verification gates.

Deployment remains a modular monolith with role-based processes; microservices are intentionally deferred.
