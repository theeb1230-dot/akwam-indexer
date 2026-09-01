# Stage #7 — Separate Download Resolver

## Decision

Playback and download are separate domain paths. A playback candidate can never
be promoted into a download candidate merely because it contains a media URL.
Only providers that implement `getDownloadOptions()` advertise the download
capability.

## Contract

- `GET /v1/episodes/:id/download-options` lists choices; it never starts a
  download or selects a choice.
- Every choice carries `requires_user_selection: true`.
- `download_file` and `external_download_page` are distinct. An external page
  is never reported as a direct file or as verified media.
- Public list responses use an opaque `id`; provider IDs, durable locators and
  temporary URLs remain server-side.
- Temporary URLs are removed recursively before any metadata or locator is
  persisted and are not exposed while listing options.
- Candidates that disappear during a successful provider refresh become
  inactive instead of being deleted.

## Storage

SQLite contains `download_candidates`. PostgreSQL receives the same table from
`003_download_candidates.sql`; the number deliberately avoids the parallel
observability migration. The SQLite-to-PostgreSQL transfer includes the table
and converts its JSON fields.

## Acceptance gate

- Unit and integration tests pass concurrently with the existing job, health,
  refresh, TLS and playback suites.
- No playback/watch field is used as a download fallback.
- No temporary URL appears in persisted locator or metadata JSON.
- Provider exceptions are reduced to stable error codes; raw upstream messages
  and URLs are not returned by the public route.
