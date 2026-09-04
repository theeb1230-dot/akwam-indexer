BEGIN;

CREATE TABLE IF NOT EXISTS playback_options (
  id BIGSERIAL PRIMARY KEY,
  provider_episode_id BIGINT NOT NULL
    REFERENCES provider_episodes(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  watch_id TEXT NOT NULL,
  quality TEXT,
  page_url TEXT,
  media_type TEXT,
  can_watch BOOLEAN NOT NULL DEFAULT TRUE,
  can_download BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active',
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, watch_id)
);

CREATE TABLE IF NOT EXISTS download_candidates (
  id BIGSERIAL PRIMARY KEY,
  canonical_episode_id BIGINT NOT NULL
    REFERENCES canonical_episodes(id) ON DELETE CASCADE,
  provider_episode_id BIGINT NOT NULL
    REFERENCES provider_episodes(id) ON DELETE CASCADE,
  candidate_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  download_id TEXT,
  quality TEXT,
  format TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  locator JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS download_candidates_episode
  ON download_candidates(canonical_episode_id, status);

INSERT INTO schema_migrations(version)
VALUES ('002_download_runtime_parity')
ON CONFLICT(version) DO NOTHING;

COMMIT;
