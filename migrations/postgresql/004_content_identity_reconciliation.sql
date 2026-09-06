BEGIN;

WITH inferred AS (
  SELECT
    ce.id,
    COALESCE(
      NULLIF((regexp_match(COALESCE(pe.source_url, pe.provider_episode_id, ''), '-s0*([0-9]+)-e0*[0-9]+'))[1], '')::integer,
      NULLIF((regexp_match(COALESCE(ce.title, ''), 'الموسم[[:space:]]*0*([0-9]+)'))[1], '')::integer
    ) AS season_number
  FROM canonical_episodes ce
  LEFT JOIN provider_episodes pe ON pe.canonical_episode_id = ce.id
)
UPDATE canonical_episodes ce
SET season_number = inferred.season_number,
    updated_at = NOW()
FROM inferred
WHERE ce.id = inferred.id
  AND inferred.season_number IS NOT NULL
  AND inferred.season_number > 0
  AND ce.season_number <> inferred.season_number
  AND NOT EXISTS (
    SELECT 1
    FROM canonical_episodes conflict
    WHERE conflict.canonical_series_id = ce.canonical_series_id
      AND conflict.season_number = inferred.season_number
      AND conflict.episode_number IS NOT DISTINCT FROM ce.episode_number
      AND conflict.id <> ce.id
  );

UPDATE canonical_series cs
SET content_type = 'movie',
    updated_at = NOW()
WHERE cs.content_type <> 'movie'
  AND (
    cs.title ~* '(^|[[:space:]])فيلم([[:space:]]|$)'
    OR EXISTS (
      SELECT 1 FROM provider_series ps
      WHERE ps.canonical_series_id = cs.id
        AND COALESCE(ps.provider_title, '') ~* '(^|[[:space:]])فيلم([[:space:]]|$)'
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM canonical_episodes ce
    WHERE ce.canonical_series_id = cs.id
  );

INSERT INTO canonical_episodes (
  canonical_series_id, season_number, episode_number, title, description, image,
  created_at, updated_at
)
SELECT cs.id, 1, 1, cs.title, cs.description, cs.image, NOW(), NOW()
FROM canonical_series cs
WHERE cs.content_type = 'movie'
  AND NOT EXISTS (
    SELECT 1 FROM canonical_episodes ce
    WHERE ce.canonical_series_id = cs.id
  )
ON CONFLICT(canonical_series_id, season_number, episode_number) DO NOTHING;

INSERT INTO provider_episodes (
  canonical_episode_id, provider_series_id, provider, provider_episode_id,
  source_url, confidence, metadata, active, last_seen_at, missing_since,
  created_at, updated_at
)
SELECT
  ce.id,
  ps.id,
  ps.provider,
  COALESCE(NULLIF(ps.source_url, ''), ps.provider_series_id),
  ps.source_url,
  1.0,
  jsonb_build_object('reconciled_from_provider_series', true),
  TRUE,
  NOW(),
  NULL,
  NOW(),
  NOW()
FROM canonical_series cs
JOIN canonical_episodes ce
  ON ce.canonical_series_id = cs.id
 AND ce.season_number = 1
 AND ce.episode_number = 1
JOIN provider_series ps ON ps.canonical_series_id = cs.id
WHERE cs.content_type = 'movie'
  AND NOT EXISTS (
    SELECT 1 FROM provider_episodes pe
    WHERE pe.canonical_episode_id = ce.id
      AND pe.provider = ps.provider
  )
ON CONFLICT(provider, provider_episode_id) DO UPDATE SET
  canonical_episode_id = excluded.canonical_episode_id,
  provider_series_id = excluded.provider_series_id,
  source_url = COALESCE(excluded.source_url, provider_episodes.source_url),
  active = TRUE,
  last_seen_at = NOW(),
  missing_since = NULL,
  updated_at = NOW();

INSERT INTO schema_migrations(version)
VALUES ('004_content_identity_reconciliation')
ON CONFLICT(version) DO NOTHING;

COMMIT;
