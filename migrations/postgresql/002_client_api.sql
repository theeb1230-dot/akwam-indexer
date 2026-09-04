BEGIN;

CREATE TABLE IF NOT EXISTS playback_sessions (
  id UUID PRIMARY KEY,
  canonical_episode_id BIGINT NOT NULL
    REFERENCES canonical_episodes(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'planning'
    CHECK (state IN ('planning', 'ready', 'unavailable', 'cancelled', 'expired')),
  requested_quality TEXT NOT NULL DEFAULT 'auto'
    CHECK (requested_quality IN ('auto', '1080p', '720p', '480p')),
  client_platform TEXT NOT NULL
    CHECK (client_platform IN ('android', 'android_tv', 'ios', 'web', 'windows')),
  client_version VARCHAR(50),
  selected_candidate_id BIGINT
    REFERENCES playback_candidates(id) ON DELETE SET NULL,
  plan_version INTEGER NOT NULL DEFAULT 1 CHECK (plan_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS playback_sessions_episode
  ON playback_sessions(canonical_episode_id, created_at DESC);
CREATE INDEX IF NOT EXISTS playback_sessions_expiry
  ON playback_sessions(state, expires_at);

CREATE TABLE IF NOT EXISTS playback_session_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL
    REFERENCES playback_sessions(id) ON DELETE CASCADE,
  event_id VARCHAR(100) NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'player_opened', 'first_frame', 'playing', 'buffering',
      'stalled', 'ended', 'fatal_error'
    )),
  position_seconds DOUBLE PRECISION CHECK (position_seconds >= 0),
  error_code VARCHAR(100),
  details JSONB,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, event_id)
);

CREATE INDEX IF NOT EXISTS playback_session_events_type
  ON playback_session_events(session_id, event_type, occurred_at);

INSERT INTO schema_migrations(version)
VALUES ('002_client_api')
ON CONFLICT(version) DO NOTHING;

COMMIT;
