const db = require("../db/schema");

function encode(value) {
  return JSON.stringify(value ?? null);
}

function getCanonicalByKey(key) {
  return db.prepare(`
    SELECT cs.*
    FROM canonical_keys ck
    JOIN canonical_series cs
      ON cs.id = ck.canonical_series_id
    WHERE ck.canonical_key = ?
  `).get(key);
}

const saveResolvedSeries = db.transaction(result => {
  const key = String(
    result.canonical_key || result.group_key || ""
  ).trim();

  if (!key) {
    throw new Error("CANONICAL_KEY_REQUIRED");
  }

  let canonical = getCanonicalByKey(key);

  if (!canonical) {
    const inserted = db.prepare(`
      INSERT INTO canonical_series (
        title, description, image, content_type, status
      )
      VALUES (?, ?, ?, ?, 'ready')
    `).run(
      result.title || key,
      result.description || null,
      result.image || null,
      result.content_type || "series"
    );

    const id = Number(inserted.lastInsertRowid);

    db.prepare(`
      INSERT INTO canonical_keys (
        canonical_key, canonical_series_id
      )
      VALUES (?, ?)
    `).run(key, id);

    canonical = { id };
  } else {
    db.prepare(`
      UPDATE canonical_series
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          image = COALESCE(?, image),
          content_type = COALESCE(?, content_type),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      result.title || null,
      result.description || null,
      result.image || null,
      result.content_type || null,
      canonical.id
    );
  }

  const providerSeries = new Map();

  for (const item of result.providers || []) {
    if (!item.ok || !item.provider_series_id) continue;

    db.prepare(`
      INSERT INTO provider_series (
        canonical_series_id, provider, provider_series_id,
        provider_title, source_url, confidence,
        is_primary, metadata_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 1.0, 0, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(provider, provider_series_id)
      DO UPDATE SET
        canonical_series_id = excluded.canonical_series_id,
        provider_title = excluded.provider_title,
        source_url = excluded.source_url,
        metadata_json = excluded.metadata_json,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      canonical.id,
      item.provider,
      String(item.provider_series_id),
      item.title || result.title || null,
      item.source_url || null,
      encode(item)
    );

    const row = db.prepare(`
      SELECT id FROM provider_series
      WHERE provider = ? AND provider_series_id = ?
    `).get(item.provider, String(item.provider_series_id));

    providerSeries.set(item.provider, row.id);
  }

  for (const episode of result.episodes || []) {
    db.prepare(`
      INSERT INTO canonical_episodes (
        canonical_series_id, season_number,
        episode_number, title, updated_at
      )
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(
        canonical_series_id, season_number, episode_number
      )
      DO UPDATE SET
        title = COALESCE(excluded.title, canonical_episodes.title),
        updated_at = CURRENT_TIMESTAMP
    `).run(
      canonical.id,
      episode.season || 1,
      episode.number,
      episode.title || null
    );

    const ce = db.prepare(`
      SELECT id FROM canonical_episodes
      WHERE canonical_series_id = ?
        AND season_number = ?
        AND episode_number = ?
    `).get(canonical.id, episode.season || 1, episode.number);

    for (const source of episode.sources || []) {
      if (!source.provider || !source.provider_episode_id) continue;

      db.prepare(`
        INSERT INTO provider_episodes (
          canonical_episode_id, provider_series_id,
          provider, provider_episode_id, source_url,
          confidence, metadata_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 1.0, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(provider, provider_episode_id)
        DO UPDATE SET
          canonical_episode_id = excluded.canonical_episode_id,
          provider_series_id = excluded.provider_series_id,
          source_url = excluded.source_url,
          metadata_json = excluded.metadata_json,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        ce.id,
        providerSeries.get(source.provider) || null,
        source.provider,
        String(source.provider_episode_id),
        source.source_url || null,
        encode(source)
      );
    }
  }

  return {
    persisted: true,
    canonical_key: key,
    canonical_series_id: canonical.id
  };
});

const saveResolvedEpisode = db.transaction(result => {
  const canonical = getCanonicalByKey(
    result.canonical_key || result.group_key
  );

  if (!canonical) {
    throw new Error("CANONICAL_SERIES_NOT_FOUND");
  }

  const ce = db.prepare(`
    SELECT id FROM canonical_episodes
    WHERE canonical_series_id = ?
      AND season_number = ?
      AND episode_number = ?
  `).get(canonical.id, result.season, result.episode);

  if (!ce) {
    throw new Error("CANONICAL_EPISODE_NOT_FOUND");
  }

  let saved = 0;

  for (const option of result.playback_plan || []) {
    const pe = db.prepare(`
      SELECT id FROM provider_episodes
      WHERE provider = ? AND provider_episode_id = ?
    `).get(option.provider, String(option.episode_id));

    if (!pe || !option.watch_id || !option.type) continue;

    const locator = {
      provider: option.provider,
      episode_id: option.episode_id,
      watch_id: option.watch_id,
      server: option.server || null
    };

    db.prepare(`
      INSERT INTO playback_candidates (
        canonical_episode_id, provider_episode_id,
        provider, watch_id, server, playback_type,
        quality, priority, status, locator_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(
        canonical_episode_id, provider, watch_id, server
      )
      DO UPDATE SET
        provider_episode_id = excluded.provider_episode_id,
        playback_type = excluded.playback_type,
        quality = excluded.quality,
        priority = excluded.priority,
        status = 'active',
        locator_json = excluded.locator_json,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      ce.id, pe.id, option.provider,
      String(option.watch_id), option.server || "",
      option.type, option.quality || null,
      option.fallback_order || option.priority || 100,
      encode(locator)
    );

    saved++;
  }

  return {
    persisted: true,
    canonical_series_id: canonical.id,
    canonical_episode_id: ce.id,
    saved_playback_candidates: saved
  };
});

module.exports = {
  saveResolvedSeries,
  saveResolvedEpisode
};
