BEGIN;

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

CREATE INDEX IF NOT EXISTS download_candidate_episode
  ON download_candidates(canonical_episode_id, status);

INSERT INTO schema_migrations(version)
VALUES ('003_download_candidates')
ON CONFLICT(version) DO NOTHING;

COMMIT;
