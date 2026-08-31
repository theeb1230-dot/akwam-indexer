BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical_series (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  original_title TEXT,
  description TEXT,
  image TEXT,
  content_type TEXT NOT NULL DEFAULT 'series',
  language TEXT,
  country TEXT,
  year TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical_keys (
  canonical_key TEXT PRIMARY KEY,
  canonical_series_id BIGINT NOT NULL UNIQUE
    REFERENCES canonical_series(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provider_series (
  id BIGSERIAL PRIMARY KEY,
  canonical_series_id BIGINT NOT NULL
    REFERENCES canonical_series(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_series_id TEXT NOT NULL,
  provider_title TEXT,
  source_url TEXT,
  quality TEXT,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  missing_since TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_series_id)
);

CREATE TABLE IF NOT EXISTS canonical_episodes (
  id BIGSERIAL PRIMARY KEY,
  canonical_series_id BIGINT NOT NULL
    REFERENCES canonical_series(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL DEFAULT 1,
  episode_number INTEGER,
  title TEXT,
  description TEXT,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(canonical_series_id, season_number, episode_number)
);

CREATE TABLE IF NOT EXISTS provider_episodes (
  id BIGSERIAL PRIMARY KEY,
  canonical_episode_id BIGINT NOT NULL
    REFERENCES canonical_episodes(id) ON DELETE CASCADE,
  provider_series_id BIGINT
    REFERENCES provider_series(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_episode_id TEXT NOT NULL,
  source_url TEXT,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  metadata JSONB,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  missing_since TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_episode_id)
);

CREATE TABLE IF NOT EXISTS playback_candidates (
  id BIGSERIAL PRIMARY KEY,
  canonical_episode_id BIGINT NOT NULL
    REFERENCES canonical_episodes(id) ON DELETE CASCADE,
  provider_episode_id BIGINT NOT NULL
    REFERENCES provider_episodes(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  watch_id TEXT NOT NULL,
  server TEXT NOT NULL DEFAULT '',
  playback_type TEXT NOT NULL,
  quality TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active',
  locator JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(canonical_episode_id, provider, watch_id, server)
);

CREATE TABLE IF NOT EXISTS playback_health (
  candidate_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  server TEXT,
  playback_type TEXT NOT NULL,
  quality TEXT,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER NOT NULL DEFAULT 0,
  last_status TEXT,
  last_failure_reason TEXT,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  circuit_open_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playback_verification (
  candidate_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  server TEXT,
  embed_status TEXT,
  playback_status TEXT,
  health_state TEXT NOT NULL DEFAULT 'UNKNOWN',
  video_element_discovered BOOLEAN NOT NULL DEFAULT FALSE,
  loadedmetadata BOOLEAN NOT NULL DEFAULT FALSE,
  canplay BOOLEAN NOT NULL DEFAULT FALSE,
  playing BOOLEAN NOT NULL DEFAULT FALSE,
  max_current_time DOUBLE PRECISION NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  checked_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS runtime_jobs (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  provider TEXT,
  provider_series_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  total INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  current_item JSONB,
  result JSONB,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS runtime_jobs_active_dedupe
  ON runtime_jobs(dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS runtime_jobs_claim
  ON runtime_jobs(status, available_at, lease_expires_at, created_at);

CREATE TABLE IF NOT EXISTS episode_health_schedule (
  canonical_episode_id BIGINT PRIMARY KEY
    REFERENCES canonical_episodes(id) ON DELETE CASCADE,
  last_status TEXT,
  last_checked_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_job_id UUID REFERENCES runtime_jobs(id) ON DELETE SET NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS provider_series_canonical
  ON provider_series(canonical_series_id);
CREATE INDEX IF NOT EXISTS canonical_episode_series
  ON canonical_episodes(canonical_series_id);
CREATE INDEX IF NOT EXISTS provider_episode_canonical
  ON provider_episodes(canonical_episode_id);
CREATE INDEX IF NOT EXISTS playback_candidate_episode
  ON playback_candidates(canonical_episode_id, status, priority);
CREATE INDEX IF NOT EXISTS episode_health_due
  ON episode_health_schedule(next_check_at);

INSERT INTO schema_migrations(version)
VALUES ('001_initial')
ON CONFLICT(version) DO NOTHING;

COMMIT;
