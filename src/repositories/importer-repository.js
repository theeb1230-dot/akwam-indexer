class SqliteImporterRepository {
  constructor(db) {
    if (!db?.prepare) throw new TypeError("SQLITE_DATABASE_REQUIRED");
    this.db = db;
  }

  async upsertSeries(providerSeriesId, data) {
    this.db.prepare(`
      INSERT INTO series (
        provider, provider_series_id, title, description, image,
        language, quality, country, year, source_url, updated_at
      ) VALUES (
        @provider, @provider_series_id, @title, @description, @image,
        @language, @quality, @country, @year, @source_url, CURRENT_TIMESTAMP
      )
      ON CONFLICT(provider, provider_series_id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        image = excluded.image,
        language = excluded.language,
        quality = excluded.quality,
        country = excluded.country,
        year = excluded.year,
        source_url = excluded.source_url,
        updated_at = CURRENT_TIMESTAMP
    `).run({
      provider: data.provider,
      provider_series_id: String(providerSeriesId),
      title: data.series.title,
      description: data.series.description,
      image: data.series.image,
      language: data.series.language,
      quality: data.series.quality,
      country: data.series.country,
      year: data.series.year,
      source_url: data.source_url
    });
    return this.db.prepare(`
      SELECT id FROM series
      WHERE provider = ? AND provider_series_id = ?
    `).get(data.provider, String(providerSeriesId)).id;
  }

  async existingEpisodeIds(seriesId, provider) {
    return this.db.prepare(`
      SELECT provider_episode_id
      FROM episodes
      WHERE series_id = ? AND provider = ?
    `).all(seriesId, provider).map(row => String(row.provider_episode_id));
  }

  async reconcileMissingEpisodes(seriesId, provider, listedIds) {
    const ids = [...new Set(listedIds.map(String))];
    let result;
    if (!ids.length) {
      result = this.db.prepare(`
        UPDATE episodes
        SET active = 0,
            missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE series_id = ? AND provider = ? AND active = 1
      `).run(seriesId, provider);
    } else {
      const placeholders = ids.map(() => "?").join(", ");
      result = this.db.prepare(`
        UPDATE episodes
        SET active = 0,
            missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE series_id = ? AND provider = ? AND active = 1
          AND provider_episode_id NOT IN (${placeholders})
      `).run(seriesId, provider, ...ids);
    }
    return result.changes;
  }

  async upsertEpisode(seriesId, episode, details) {
    this.db.prepare(`
      INSERT INTO episodes (
        series_id, provider, provider_episode_id, episode_number,
        title, description, image, source_url, active,
        last_seen_at, missing_since, updated_at
      ) VALUES (
        @series_id, @provider, @provider_episode_id, @episode_number,
        @title, @description, @image, @source_url, 1,
        CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP
      )
      ON CONFLICT(provider, provider_episode_id) DO UPDATE SET
        series_id = excluded.series_id,
        episode_number = excluded.episode_number,
        title = excluded.title,
        description = excluded.description,
        image = excluded.image,
        source_url = excluded.source_url,
        active = 1,
        last_seen_at = CURRENT_TIMESTAMP,
        missing_since = NULL,
        updated_at = CURRENT_TIMESTAMP
    `).run({
      series_id: seriesId,
      provider: details.provider,
      provider_episode_id: String(details.episode.id),
      episode_number: episode.number,
      title: details.episode.title || episode.title,
      description: details.episode.description,
      image: details.episode.image,
      source_url: details.source_url
    });
    return this.db.prepare(`
      SELECT id FROM episodes
      WHERE provider = ? AND provider_episode_id = ?
    `).get(details.provider, String(details.episode.id)).id;
  }

  async upsertWatchOption(episodeDbId, provider, option) {
    this.db.prepare(`
      INSERT INTO watch_options (
        episode_id, provider, watch_id, quality, page_url, updated_at
      ) VALUES (
        @episode_id, @provider, @watch_id, @quality, @page_url, CURRENT_TIMESTAMP
      )
      ON CONFLICT(provider, watch_id) DO UPDATE SET
        episode_id = excluded.episode_id,
        quality = excluded.quality,
        page_url = excluded.page_url,
        updated_at = CURRENT_TIMESTAMP
    `).run({
      episode_id: episodeDbId,
      provider,
      watch_id: String(option.watch_id),
      quality: option.quality,
      page_url: option.page_url
    });
  }
}

class PostgresImporterRepository {
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

  async upsertSeries(providerSeriesId, data) {
    const provider = data.provider;
    const externalId = String(providerSeriesId);
    const key = `provider:${provider}:${externalId}`;
    return this.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
      let canonical = await client.query(`
        SELECT canonical_series_id AS id
        FROM canonical_keys
        WHERE canonical_key = $1
      `, [key]);

      let canonicalId = canonical.rows[0]?.id;
      if (!canonicalId) {
        const inserted = await client.query(`
          INSERT INTO canonical_series (
            title, description, image, language, country, year, content_type, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ready')
          RETURNING id
        `, [
          data.series.title || externalId,
          data.series.description || null,
          data.series.image || null,
          data.series.language || null,
          data.series.country || null,
          data.series.year || null,
          data.series.content_type === "movie" ? "movie" : "series"
        ]);
        canonicalId = inserted.rows[0].id;
        await client.query(`
          INSERT INTO canonical_keys (canonical_key, canonical_series_id)
          VALUES ($1, $2)
        `, [key, canonicalId]);
      }

      await client.query(`
        UPDATE canonical_series
        SET content_type = $2,
            title = COALESCE(NULLIF($3, ''), title),
            description = COALESCE($4, description),
            image = COALESCE($5, image),
            updated_at = NOW()
        WHERE id = $1
      `, [
        canonicalId,
        data.series.content_type === "movie" ? "movie" : "series",
        data.series.title || "",
        data.series.description || null,
        data.series.image || null
      ]);

      await client.query(`
        INSERT INTO provider_series (
          canonical_series_id, provider, provider_series_id,
          provider_title, source_url, quality, metadata,
          active, last_seen_at, missing_since, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, TRUE, NOW(), NULL, NOW())
        ON CONFLICT(provider, provider_series_id) DO UPDATE SET
          canonical_series_id = excluded.canonical_series_id,
          provider_title = excluded.provider_title,
          source_url = excluded.source_url,
          quality = excluded.quality,
          metadata = excluded.metadata,
          active = TRUE,
          last_seen_at = NOW(),
          missing_since = NULL,
          updated_at = NOW()
      `, [
        canonicalId,
        provider,
        externalId,
        data.series.title || null,
        data.source_url || null,
        data.series.quality || null,
        JSON.stringify({
          description: data.series.description || null,
          image: data.series.image || null,
          language: data.series.language || null,
          country: data.series.country || null,
          year: data.series.year || null
        })
      ]);
      return Number(canonicalId);
    });
  }

  async existingEpisodeIds(seriesId, provider) {
    const result = await this.pool.query(`
      SELECT pe.provider_episode_id
      FROM provider_episodes pe
      JOIN provider_series ps ON ps.id = pe.provider_series_id
      WHERE ps.canonical_series_id = $1 AND pe.provider = $2
    `, [seriesId, provider]);
    return result.rows.map(row => String(row.provider_episode_id));
  }

  async reconcileMissingEpisodes(seriesId, provider, listedIds) {
    const ids = [...new Set(listedIds.map(String))];
    const result = await this.pool.query(`
      UPDATE provider_episodes pe
      SET active = FALSE,
          missing_since = COALESCE(pe.missing_since, NOW()),
          updated_at = NOW()
      FROM provider_series ps
      WHERE pe.provider_series_id = ps.id
        AND ps.canonical_series_id = $1
        AND pe.provider = $2
        AND pe.active = TRUE
        AND ($3::text[] = '{}'::text[] OR NOT (pe.provider_episode_id = ANY($3::text[])))
    `, [seriesId, provider, ids]);
    return result.rowCount || 0;
  }

  async upsertEpisode(seriesId, episode, details) {
    return this.transaction(async client => {
      const providerSeries = await client.query(`
        SELECT id FROM provider_series
        WHERE canonical_series_id = $1 AND provider = $2
        ORDER BY id ASC LIMIT 1
      `, [seriesId, details.provider]);
      if (!providerSeries.rows[0]) throw new Error("PROVIDER_SERIES_NOT_FOUND");

      const canonicalEpisode = await client.query(`
        INSERT INTO canonical_episodes (
          canonical_series_id, season_number, episode_number,
          title, description, image, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT(canonical_series_id, season_number, episode_number)
        DO UPDATE SET
          title = COALESCE(excluded.title, canonical_episodes.title),
          description = COALESCE(excluded.description, canonical_episodes.description),
          image = COALESCE(excluded.image, canonical_episodes.image),
          updated_at = NOW()
        RETURNING id
      `, [
        seriesId,
        Number(episode.season_number || episode.season || 1),
        episode.number,
        details.episode.title || episode.title || null,
        details.episode.description || null,
        details.episode.image || null
      ]);

      const providerEpisode = await client.query(`
        INSERT INTO provider_episodes (
          canonical_episode_id, provider_series_id, provider,
          provider_episode_id, source_url, metadata,
          active, last_seen_at, missing_since, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE, NOW(), NULL, NOW())
        ON CONFLICT(provider, provider_episode_id) DO UPDATE SET
          canonical_episode_id = excluded.canonical_episode_id,
          provider_series_id = excluded.provider_series_id,
          source_url = excluded.source_url,
          metadata = excluded.metadata,
          active = TRUE,
          last_seen_at = NOW(),
          missing_since = NULL,
          updated_at = NOW()
        RETURNING id
      `, [
        canonicalEpisode.rows[0].id,
        providerSeries.rows[0].id,
        details.provider,
        String(details.episode.id),
        details.source_url || null,
        JSON.stringify({ title: details.episode.title || episode.title || null })
      ]);
      return Number(providerEpisode.rows[0].id);
    });
  }

  async upsertWatchOption(episodeDbId, provider, option) {
    const episode = await this.pool.query(`
      SELECT canonical_episode_id
      FROM provider_episodes
      WHERE id = $1 AND provider = $2
    `, [episodeDbId, provider]);
    if (!episode.rows[0] || !option.watch_id) return;

    const playbackType = option.type || "resolver";
    const locator = {
      provider,
      watch_id: String(option.watch_id),
      page_url: option.page_url || null
    };

    await this.pool.query(`
      INSERT INTO playback_options (
        provider_episode_id, provider, watch_id, quality, page_url,
        media_type, can_watch, can_download, priority, status, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW())
      ON CONFLICT(provider, watch_id)
      DO UPDATE SET
        provider_episode_id = excluded.provider_episode_id,
        quality = excluded.quality,
        page_url = excluded.page_url,
        media_type = excluded.media_type,
        can_watch = excluded.can_watch,
        can_download = excluded.can_download,
        priority = excluded.priority,
        status = 'active',
        updated_at = NOW()
    `, [
      episodeDbId,
      provider,
      String(option.watch_id),
      option.quality || null,
      option.page_url || null,
      playbackType,
      option.can_watch !== false,
      option.can_download === true,
      Number(option.priority || 100)
    ]);

    await this.pool.query(`
      INSERT INTO playback_candidates (
        canonical_episode_id, provider_episode_id, provider, watch_id,
        server, playback_type, quality, priority, status, locator, updated_at
      ) VALUES ($1, $2, $3, $4, '', $5, $6, 100, 'active', $7::jsonb, NOW())
      ON CONFLICT(canonical_episode_id, provider, watch_id, server)
      DO UPDATE SET
        provider_episode_id = excluded.provider_episode_id,
        playback_type = excluded.playback_type,
        quality = excluded.quality,
        status = 'active',
        locator = excluded.locator,
        updated_at = NOW()
    `, [
      episode.rows[0].canonical_episode_id,
      episodeDbId,
      provider,
      String(option.watch_id),
      playbackType,
      option.quality || null,
      JSON.stringify(locator)
    ]);
  }
}

function createImporterRepository(env = process.env) {
  const { DRIVERS, databaseDriver } = require("../db/config");
  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("../db/postgres");
    return new PostgresImporterRepository(getPool(env));
  }
  return new SqliteImporterRepository(require("../db/schema"));
}

module.exports = {
  SqliteImporterRepository,
  PostgresImporterRepository,
  createImporterRepository
};
