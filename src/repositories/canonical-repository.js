class SqliteCanonicalRepository {
  constructor(db) {
    if (!db?.prepare || !db?.transaction) throw new TypeError("SQLITE_DATABASE_REQUIRED");
    this.db = db;
  }

  async saveResolvedSeries(result, key) {
    const db = this.db;
    return db.transaction(() => {
      let canonical = db.prepare(`
        SELECT cs.* FROM canonical_keys ck
        JOIN canonical_series cs ON cs.id = ck.canonical_series_id
        WHERE ck.canonical_key = ?
      `).get(key);

      if (!canonical) {
        const inserted = db.prepare(`
          INSERT INTO canonical_series (title, description, image, content_type, status)
          VALUES (?, ?, ?, ?, 'ready')
        `).run(
          result.title || key,
          result.description || null,
          result.image || null,
          result.content_type || "series"
        );
        canonical = { id: Number(inserted.lastInsertRowid) };
        db.prepare(`
          INSERT INTO canonical_keys (canonical_key, canonical_series_id)
          VALUES (?, ?)
        `).run(key, canonical.id);
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
            provider_title, source_url, confidence, is_primary,
            metadata_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, 1.0, 0, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(provider, provider_series_id) DO UPDATE SET
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
          JSON.stringify(item)
        );
        const row = db.prepare(`
          SELECT id FROM provider_series
          WHERE provider = ? AND provider_series_id = ?
        `).get(item.provider, String(item.provider_series_id));
        providerSeries.set(item.provider, row.id);
      }

      for (const episode of result.episodes || []) {
        const season = episode.season || 1;
        db.prepare(`
          INSERT INTO canonical_episodes (
            canonical_series_id, season_number, episode_number, title, updated_at
          ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(canonical_series_id, season_number, episode_number)
          DO UPDATE SET
            title = COALESCE(excluded.title, canonical_episodes.title),
            updated_at = CURRENT_TIMESTAMP
        `).run(canonical.id, season, episode.number, episode.title || null);

        const ce = db.prepare(`
          SELECT id FROM canonical_episodes
          WHERE canonical_series_id = ? AND season_number = ? AND episode_number = ?
        `).get(canonical.id, season, episode.number);

        for (const source of episode.sources || []) {
          if (!source.provider || !source.provider_episode_id) continue;
          db.prepare(`
            INSERT INTO provider_episodes (
              canonical_episode_id, provider_series_id, provider,
              provider_episode_id, source_url, confidence, metadata_json,
              active, last_seen_at, missing_since, updated_at
            ) VALUES (?, ?, ?, ?, ?, 1.0, ?, 1, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
            ON CONFLICT(provider, provider_episode_id) DO UPDATE SET
              canonical_episode_id = excluded.canonical_episode_id,
              provider_series_id = excluded.provider_series_id,
              source_url = excluded.source_url,
              metadata_json = excluded.metadata_json,
              active = 1,
              last_seen_at = CURRENT_TIMESTAMP,
              missing_since = NULL,
              updated_at = CURRENT_TIMESTAMP
          `).run(
            ce.id,
            providerSeries.get(source.provider) || null,
            source.provider,
            String(source.provider_episode_id),
            source.source_url || null,
            JSON.stringify(source)
          );
        }
      }

      return { persisted: true, canonical_key: key, canonical_series_id: canonical.id };
    })();
  }

  async saveResolvedEpisode(result, key) {
    const db = this.db;
    return db.transaction(() => {
      const canonical = db.prepare(`
        SELECT cs.* FROM canonical_keys ck
        JOIN canonical_series cs ON cs.id = ck.canonical_series_id
        WHERE ck.canonical_key = ?
      `).get(key);
      if (!canonical) throw new Error("CANONICAL_SERIES_NOT_FOUND");

      const ce = db.prepare(`
        SELECT id FROM canonical_episodes
        WHERE canonical_series_id = ? AND season_number = ? AND episode_number = ?
      `).get(canonical.id, result.season, result.episode);
      if (!ce) throw new Error("CANONICAL_EPISODE_NOT_FOUND");

      let saved = 0;
      for (const option of result.playback_plan || []) {
        const pe = db.prepare(`
          SELECT id FROM provider_episodes
          WHERE provider = ? AND provider_episode_id = ?
        `).get(option.provider, String(option.episode_id));
        if (!pe || !option.watch_id || !option.type) continue;

        const locator = JSON.stringify({
          provider: option.provider,
          episode_id: option.episode_id,
          watch_id: option.watch_id,
          server: option.server || null
        });

        db.prepare(`
          INSERT INTO playback_candidates (
            canonical_episode_id, provider_episode_id, provider, watch_id,
            server, playback_type, quality, priority, status, locator_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(canonical_episode_id, provider, watch_id, server)
          DO UPDATE SET
            provider_episode_id = excluded.provider_episode_id,
            playback_type = excluded.playback_type,
            quality = excluded.quality,
            priority = excluded.priority,
            status = 'active',
            locator_json = excluded.locator_json,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          ce.id, pe.id, option.provider, String(option.watch_id),
          option.server || "", option.type, option.quality || null,
          option.fallback_order || option.priority || 100, locator
        );
        saved += 1;
      }

      return {
        persisted: true,
        canonical_series_id: canonical.id,
        canonical_episode_id: ce.id,
        saved_playback_candidates: saved
      };
    })();
  }
}

class PostgresCanonicalRepository {
  constructor(pool) {
    if (!pool?.connect) throw new TypeError("POSTGRES_POOL_REQUIRED");
    this.pool = pool;
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveResolvedSeries(result, key) {
    return this.transaction(async client => {
      let found = await client.query(`
        SELECT cs.* FROM canonical_keys ck
        JOIN canonical_series cs ON cs.id = ck.canonical_series_id
        WHERE ck.canonical_key = $1
        FOR UPDATE OF cs
      `, [key]);
      let canonical = found.rows[0];

      if (!canonical) {
        const inserted = await client.query(`
          INSERT INTO canonical_series (title, description, image, content_type, status)
          VALUES ($1, $2, $3, $4, 'ready')
          RETURNING *
        `, [result.title || key, result.description || null, result.image || null, result.content_type || "series"]);
        canonical = inserted.rows[0];
        await client.query(`
          INSERT INTO canonical_keys (canonical_key, canonical_series_id)
          VALUES ($1, $2)
        `, [key, canonical.id]);
      } else {
        const updated = await client.query(`
          UPDATE canonical_series
          SET title = COALESCE($1, title),
              description = COALESCE($2, description),
              image = COALESCE($3, image),
              content_type = COALESCE($4, content_type),
              updated_at = NOW()
          WHERE id = $5
          RETURNING *
        `, [
          result.title || null,
          result.description || null,
          result.image || null,
          result.content_type || null,
          canonical.id
        ]);
        canonical = updated.rows[0];
      }

      const providerSeries = new Map();
      for (const item of result.providers || []) {
        if (!item.ok || !item.provider_series_id) continue;
        const row = await client.query(`
          INSERT INTO provider_series (
            canonical_series_id, provider, provider_series_id,
            provider_title, source_url, confidence, is_primary,
            metadata, active, last_seen_at, missing_since, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 1.0, FALSE, $6::jsonb, TRUE, NOW(), NULL, NOW())
          ON CONFLICT(provider, provider_series_id) DO UPDATE SET
            canonical_series_id = excluded.canonical_series_id,
            provider_title = excluded.provider_title,
            source_url = excluded.source_url,
            metadata = excluded.metadata,
            active = TRUE,
            last_seen_at = NOW(),
            missing_since = NULL,
            updated_at = NOW()
          RETURNING id
        `, [
          canonical.id,
          item.provider,
          String(item.provider_series_id),
          item.title || result.title || null,
          item.source_url || null,
          JSON.stringify(item)
        ]);
        providerSeries.set(item.provider, row.rows[0].id);
      }

      for (const episode of result.episodes || []) {
        const season = episode.season || 1;
        const ceResult = await client.query(`
          INSERT INTO canonical_episodes (
            canonical_series_id, season_number, episode_number, title, updated_at
          ) VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT(canonical_series_id, season_number, episode_number)
          DO UPDATE SET
            title = COALESCE(excluded.title, canonical_episodes.title),
            updated_at = NOW()
          RETURNING id
        `, [canonical.id, season, episode.number, episode.title || null]);
        const ceId = ceResult.rows[0].id;

        for (const source of episode.sources || []) {
          if (!source.provider || !source.provider_episode_id) continue;
          await client.query(`
            INSERT INTO provider_episodes (
              canonical_episode_id, provider_series_id, provider,
              provider_episode_id, source_url, confidence, metadata,
              active, last_seen_at, missing_since, updated_at
            ) VALUES ($1, $2, $3, $4, $5, 1.0, $6::jsonb, TRUE, NOW(), NULL, NOW())
            ON CONFLICT(provider, provider_episode_id) DO UPDATE SET
              canonical_episode_id = excluded.canonical_episode_id,
              provider_series_id = excluded.provider_series_id,
              source_url = excluded.source_url,
              metadata = excluded.metadata,
              active = TRUE,
              last_seen_at = NOW(),
              missing_since = NULL,
              updated_at = NOW()
          `, [
            ceId,
            providerSeries.get(source.provider) || null,
            source.provider,
            String(source.provider_episode_id),
            source.source_url || null,
            JSON.stringify(source)
          ]);
        }
      }

      return {
        persisted: true,
        canonical_key: key,
        canonical_series_id: Number(canonical.id)
      };
    });
  }

  async saveResolvedEpisode(result, key) {
    return this.transaction(async client => {
      const canonicalResult = await client.query(`
        SELECT cs.* FROM canonical_keys ck
        JOIN canonical_series cs ON cs.id = ck.canonical_series_id
        WHERE ck.canonical_key = $1
        FOR UPDATE OF cs
      `, [key]);
      const canonical = canonicalResult.rows[0];
      if (!canonical) throw new Error("CANONICAL_SERIES_NOT_FOUND");

      const ceResult = await client.query(`
        SELECT id FROM canonical_episodes
        WHERE canonical_series_id = $1 AND season_number = $2 AND episode_number = $3
      `, [canonical.id, result.season, result.episode]);
      const ce = ceResult.rows[0];
      if (!ce) throw new Error("CANONICAL_EPISODE_NOT_FOUND");

      let saved = 0;
      for (const option of result.playback_plan || []) {
        const peResult = await client.query(`
          SELECT id FROM provider_episodes
          WHERE provider = $1 AND provider_episode_id = $2
        `, [option.provider, String(option.episode_id)]);
        const pe = peResult.rows[0];
        if (!pe || !option.watch_id || !option.type) continue;

        const locator = {
          provider: option.provider,
          episode_id: option.episode_id,
          watch_id: option.watch_id,
          server: option.server || null
        };

        await client.query(`
          INSERT INTO playback_candidates (
            canonical_episode_id, provider_episode_id, provider, watch_id,
            server, playback_type, quality, priority, status, locator, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9::jsonb, NOW())
          ON CONFLICT(canonical_episode_id, provider, watch_id, server)
          DO UPDATE SET
            provider_episode_id = excluded.provider_episode_id,
            playback_type = excluded.playback_type,
            quality = excluded.quality,
            priority = excluded.priority,
            status = 'active',
            locator = excluded.locator,
            updated_at = NOW()
        `, [
          ce.id, pe.id, option.provider, String(option.watch_id),
          option.server || "", option.type, option.quality || null,
          option.fallback_order || option.priority || 100,
          JSON.stringify(locator)
        ]);
        saved += 1;
      }

      return {
        persisted: true,
        canonical_series_id: Number(canonical.id),
        canonical_episode_id: Number(ce.id),
        saved_playback_candidates: saved
      };
    });
  }
}

function createCanonicalRepository(env = process.env) {
  const { DRIVERS, databaseDriver } = require("../db/config");
  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("../db/postgres");
    return new PostgresCanonicalRepository(getPool(env));
  }
  return new SqliteCanonicalRepository(require("../db/schema"));
}

module.exports = {
  PostgresCanonicalRepository,
  SqliteCanonicalRepository,
  createCanonicalRepository
};
