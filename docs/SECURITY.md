# Theeb Engine security baseline

## Production gate

- Set `NODE_ENV=production`. Authentication then fails closed unless
  `THEEB_API_TOKEN` contains at least 32 characters. Production startup also
  rejects `THEEB_AUTH_REQUIRED=false`; unauthenticated mode is local-only.
- Store the token in the hosting provider's secret manager. Do not put it in
  Git, Docker image layers, logs, query strings, or Flutter source code.
- Clients send `Authorization: Bearer <token>` over verified HTTPS.
- Keep `THEEB_TRUST_PROXY_HOPS=0` unless the API is behind a known, controlled
  number of reverse proxies that replace forwarding headers. Configure the
  exact hop count (normally `1`), never boolean `true`; otherwise forged
  `X-Forwarded-For` values can bypass IP rate limits.
- Rotate tokens by replacing the secret and restarting instances. Session and
  account authentication can replace this baseline without changing routes.

## Network retrieval rules

The playback endpoint accepts provider/watch/episode identifiers, never an
arbitrary caller URL. Every resolved playback URL and every redirect passes the
shared safe request layer:

1. only HTTP(S), with no URL credentials;
2. DNS resolves before the request;
3. loopback, private, link-local, reserved and documentation ranges are blocked;
4. the validated address is pinned into the connection;
5. redirects are not followed automatically and are resolved and checked again;
6. TLS certificate and hostname verification remain enabled;
7. metadata responses default to 2 MiB maximum; video is streamed and not
   buffered, while its complete redirect chain remains validated.

Do not add `rejectUnauthorized: false`, an endpoint accepting caller-provided
URLs, or Axios automatic redirects to playback paths.

## HTTP controls

- JSON/form body default: 256 KiB and configurable only up to 1 MiB.
- Form parameter maximum: 50.
- Search text default: 200 characters.
- Other input string default: 500 characters; request URI maximum: 2,048.
- Per-instance IP rate limit default: 120 requests/minute.
- Errors use the versioned contract
  `{ error: { schema_version: "1.0", code, message, details? }, request_id }`.
  Only allowlisted detail fields are emitted; provider messages, upstream URLs,
  stack traces, tokens, and query strings are never copied to clients.
- Telemetry routes must compose the same authentication middleware with a
  separate `telemetry` limiter scope (default maximum 60/minute), strict JSON
  body limits, platform allowlists, and bounded event-name/cardinality fields.

The in-memory limiter is intentionally a safe modular-monolith baseline. Before
horizontal API scaling, back it with the shared Redis/PostgreSQL limiter so the
quota is global across instances.

## Secret response

If a token is exposed: revoke/replace it immediately, restart all API instances,
review request logs by request ID, and remove the leaked value from Git history
if it was ever committed. Never merely delete it in a later commit.
