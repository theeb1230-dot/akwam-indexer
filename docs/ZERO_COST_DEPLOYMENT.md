# Zero-cost deployment contract

This repository is prepared for a zero-cost deployment split, but **no external deployment is claimed by this document**.

## Supported free targets

- API/Web: Koyeb Free when an account and free service slot are available.
- Workers: Oracle Cloud Always Free when an account and VM capacity are available.
- PostgreSQL: a free PostgreSQL tier such as Neon Free, subject to current provider limits.
- CI and release gates: GitHub Actions within the repository's available free quota.

## Hard rules

- `THEEB_ZERO_COST_ONLY=true` must be enabled for production validation.
- `THEEB_DEPLOYMENT_TARGET` must be one of the explicitly allowed free targets.
- No autoscaling that can create billable instances.
- No paid custom domain purchase.
- No automatic plan upgrades when free quotas are exhausted.
- PostgreSQL production TLS must remain `PGSSLMODE=verify-full`.
- `POSTGRES_RUNTIME_PARITY=verified` is mandatory.
- Database credentials must be injected through platform secrets or mounted secret files, never committed.

## Evidence required before saying "deployed"

A deployment is considered proven only when all of the following exist:

1. A real HTTPS base URL from the external platform.
2. `/livez` returns `status=alive`.
3. `/readyz` returns `status=ready`.
4. `/api` returns Theeb Engine metadata.
5. `/` returns the «ذيب العرب» PWA shell.
6. `npm run deploy:smoke` succeeds against that HTTPS URL.
7. The deployed version matches the intended release when `THEEB_EXPECTED_VERSION` is set.

## Current blocker

External provisioning cannot be completed from repository-only access because it requires a provider account and platform credentials/secrets. Until those are available, the repository can only prove deployment readiness locally and in CI. Do not report a Koyeb URL, Oracle worker, PostgreSQL instance, or subdomain as active without the evidence above.
