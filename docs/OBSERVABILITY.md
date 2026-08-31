# Observability and playback telemetry

Theeb emits one-line JSON logs with a correlation ID (`x-request-id`), status and latency. Secret-bearing fields and URL fields are recursively redacted. Raw temporary playback URLs must never be used as metric labels or returned by admin endpoints.

## Client telemetry

Create a session with `POST /v1/playback/sessions`, then send allowlisted events to `POST /v1/playback/sessions/:sessionId/events`:

`player_opened`, `first_frame`, `playing`, `buffering`, `stalled`, `ended`, `fatal_error`.

The server aggregates first-frame latency, buffering/stall counts and terminal status. Event metadata is intentionally not persisted in this first version, preventing clients from smuggling URLs or secrets into observability storage.

## Read-only admin API

Set a long random `ADMIN_READ_TOKEN` and use `Authorization: Bearer <token>`. Without a configured token the API fails closed with `503 ADMIN_API_DISABLED`.

- `GET /internal/admin/health/providers`
- `GET /internal/admin/circuits`
- `GET /internal/admin/jobs`
- `GET /internal/admin/playback`
- `GET /internal/admin/metrics`
- `GET /internal/admin/metrics.prom`

The views use explicit column allowlists. They never expose payload JSON, errors JSON, candidate locators, direct URLs, cookies, headers or credentials.

Metrics are process-local by design. A production collector should scrape every API/worker instance and aggregate centrally.
