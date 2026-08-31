BEGIN;

CREATE TABLE playback_sessions (
  id UUID PRIMARY KEY,
  canonical_episode_id BIGINT REFERENCES canonical_episodes(id) ON DELETE SET NULL,
  client_platform TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  selected_candidate_key TEXT,
  first_frame_ms INTEGER,
  buffering_count INTEGER NOT NULL DEFAULT 0,
  stalled_count INTEGER NOT NULL DEFAULT 0,
  fatal_error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_event_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE playback_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES playback_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'player_opened', 'first_frame', 'playing', 'buffering',
    'stalled', 'ended', 'fatal_error'
  )),
  position_seconds DOUBLE PRECISION,
  error_code TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_playback_events_session
  ON playback_events(session_id, occurred_at);
CREATE INDEX idx_playback_sessions_status
  ON playback_sessions(status, updated_at);

COMMIT;
