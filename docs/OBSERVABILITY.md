# Observability and playback telemetry

Theeb emits one-line JSON logs with a correlation ID (`x-request-id`), status and latency. Secret-bearing fields and URL fields are recursively redacted. Raw temporary playback URLs must never be used as metric labels or returned by admin endpoints.

## Client telemetry boundary

Stage #9 owns the durable playback-session schema and the public Flutter contract. Create a session with `POST /v1/playback/sessions`, then send feedback to `POST /v1/playback/sessions/:id/feedback` using only these event types:

`player_opened`, `first_frame`, `playing`, `buffering`, `stalled`, `ended`, `fatal_error`.

Event IDs are idempotent per session. The server stores its own receipt time, bounds client timestamps and numeric positions, and rejects arbitrary event types or unbounded details. Observability reads those records through a repository boundary; it does not define a second telemetry schema.

## Read-only admin API

Set a long random `ADMIN_READ_TOKEN` or mount it via `ADMIN_READ_TOKEN_FILE`, then use `Authorization: Bearer <token>`. Supplying both sources is rejected; without a valid configured token the API fails closed with `503 ADMIN_API_DISABLED`.

- `GET /internal/admin/health/providers`
- `GET /internal/admin/circuits`
- `GET /internal/admin/jobs`
- `GET /internal/admin/playback`
- `GET /internal/admin/metrics`
- `GET /internal/admin/metrics.prom`

The views use explicit column allowlists and a storage adapter for SQLite or PostgreSQL. Storage failures return `503 ADMIN_STORAGE_UNAVAILABLE` without leaking database errors. The views never expose payload JSON, errors JSON, candidate locators, direct URLs, cookies, headers or credentials.

Metrics are process-local by design. Metric names and labels are validated, secret-bearing dimensions are rejected, telemetry dimensions are allowlisted, and every metric has a hard series-cardinality ceiling. A production collector should scrape every API/worker instance and aggregate centrally.
