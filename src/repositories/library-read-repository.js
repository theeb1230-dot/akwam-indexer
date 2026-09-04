function normalizeRow(row) {
  if (!row) return row;
  const output = { ...row };
  for (const key of ["id", "episode_count", "watch_option_count"]) {
    if (output[key] != null) output[key] = Number(output[key]);
  }
  return output;
}

class SqliteLibraryReadRepository {
  constructor(db) {
    if (!db?.prepare) throw new TypeError("SQLITE_DATABASE_REQUIRED");
    this.db = db;
  }

  async stats() {
    return {
      series: Number(this.db.prepare("SELECT COUNT(*) AS count FROM series").get().count),
      episodes: Number(this.db.prepare("SELECT COUNT(*) AS count FROM episodes").get().count),
      watch_options: Number(this.db.prepare("SELECT COUNT(*) AS count FROM watch_options").get().count),
      providers: Number(this.db.prepare("SELECT COUNT(DISTINCT provider) AS count FROM series").get().count)
    };
  }

  async search(query) {
    const pattern = `%${query}%`;
    return this.db.prepare(`
      SELECT
        s.id, s.provider, s.provider_series_id, s.title, s.description,
        s.image, s.language, s.quality, s.country, s.year, s.updated_at,
        COUNT(DISTINCT e.id) AS episode_count
      FROM series s
      LEFT JOIN episodes e ON e.series_id = s.id
      WHERE s.title LIKE ? OR s.description LIKE ? OR s.country LIKE ? OR s.year LIKE ?
      GROUP BY s.id
      ORDER BY s.updated_at DESC
    `).all(pattern, pattern, pattern, pattern).map(normalizeRow);
  }

  async listSeries() {
    return this.db.prepare(`
      SELECT
        s.id, s.provider, s.provider_series_id, s.title, s.description,
        s.image, s.language, s.quality, s.country, s.year, s.source_url,
        s.created_at, s.updated_at,
        COUNT(DISTINCT e.id) AS episode_count
      FROM series s
      LEFT JOIN episodes e ON e.series_id = s.id
      GROUP BY s.id
      ORDER BY s.updated_at DESC
    `).all().map(normalizeRow);
  }

  async getSeriesEpisodes(id) {
    const series = this.db.prepare(`
      SELECT id, title, provider, provider_series_id
      FROM series WHERE id = ?
    `).get(id);
    if (!series) return null;

    const episodes = this.db.prepare(`
      SELECT
        e.id, e.provider, e.provider_episode_id, e.episode_number,
        e.title, e.description, e.image, e.source_url,
        COUNT(w.id) AS watch_option_count
      FROM episodes e
      LEFT JOIN watch_options w ON w.episode_id = e.id
      WHERE e.series_id = ?
      GROUP BY e.id
      ORDER BY e.episode_number ASC
    `).all(series.id).map(normalizeRow);

    return { series: normalizeRow(series), episodes };
  }

  async getSeries(id) {
    const series = this.db.prepare("SELECT * FROM series WHERE id = ?").get(id);
    if (!series) return null;
    const episodes = this.db.prepare(`
      SELECT
        id, provider, provider_episode_id, episode_number, title,
        description, image, source_url, created_at, updated_at
      FROM episodes
      WHERE series_id = ?
      ORDER BY episode_number ASC
    `).all(series.id).map(normalizeRow);
    return { ...normalizeRow(series), episode_count: episodes.length, episodes };
  }

  async getEpisode(id) {
    const episode = this.db.prepare(`
      SELECT e.*, s.title AS series_title
      FROM episodes e
      JOIN series s ON s.id = e.series_id
      WHERE e.id = ?
    `).get(id);
    if (!episode) return null;
    const watchOptions = this.db.prepare(`
      SELECT id, provider, watch_id, quality, page_url, created_at, updated_at
      FROM watch_options
      WHERE episode_id = ?
      ORDER BY quality DESC
    `).all(episode.id).map(normalizeRow);
    return { ...normalizeRow(episode), watch_options: watchOptions };
  }
}

class PostgresLibraryReadRepository {
  constructor(pool) {
    if (!pool?.query) throw new TypeError("POSTGRES_POOL_REQUIRED");
    this.pool = pool;
  }

  async stats() {
    const result = await this.pool.query(`
      SELECT
        (SELECT COUNT(*)::integer FROM provider_series WHERE active = TRUE) AS series,
        (SELECT COUNT(*)::integer FROM provider_episodes WHERE active = TRUE) AS episodes,
        (SELECT COUNT(*)::integer FROM playback_candidates WHERE status = 'active') AS watch_options,
        (SELECT COUNT(DISTINCT provider)::integer FROM provider_series WHERE active = TRUE) AS providers
    `);
    return result.rows[0];
  }

  async search(query) {
    const result = await this.pool.query(`
      SELECT
        ps.canonical_series_id AS id,
        ps.provider,
        ps.provider_series_id,
        COALESCE(ps.provider_title, cs.title) AS title,
        cs.description,
        cs.image,
        cs.language,
        ps.quality,
        cs.country,
        cs.year,
        ps.updated_at,
        COUNT(DISTINCT pe.id)::integer AS episode_count
      FROM provider_series ps
      JOIN canonical_series cs ON cs.id = ps.canonical_series_id
      LEFT JOIN provider_episodes pe
        ON pe.provider_series_id = ps.id AND pe.active = TRUE
      WHERE ps.active = TRUE
        AND (
          COALESCE(ps.provider_title, cs.title) ILIKE $1
          OR COALESCE(cs.description, '') ILIKE $1
          OR COALESCE(cs.country, '') ILIKE $1
          OR COALESCE(cs.year, '') ILIKE $1
        )
      GROUP BY ps.id, cs.id
      ORDER BY ps.updated_at DESC
    `, [`%${query}%`]);
    return result.rows.map(normalizeRow);
  }

  async listSeries() {
    const result = await this.pool.query(`
      SELECT
        ps.canonical_series_id AS id,
        ps.provider,
        ps.provider_series_id,
        COALESCE(ps.provider_title, cs.title) AS title,
        cs.description,
        cs.image,
        cs.language,
        ps.quality,
        cs.country,
        cs.year,
        ps.source_url,
        ps.created_at,
        ps.updated_at,
        COUNT(DISTINCT pe.id)::integer AS episode_count
      FROM provider_series ps
      JOIN canonical_series cs ON cs.id = ps.canonical_series_id
      LEFT JOIN provider_episodes pe
        ON pe.provider_series_id = ps.id AND pe.active = TRUE
      WHERE ps.active = TRUE
      GROUP BY ps.id, cs.id
      ORDER BY ps.updated_at DESC
    `);
    return result.rows.map(normalizeRow);
  }

  async providerSeriesByCanonicalId(id) {
    const result = await this.pool.query(`
      SELECT
        ps.id AS provider_series_db_id,
        ps.canonical_series_id AS id,
        COALESCE(ps.provider_title, cs.title) AS title,
        ps.provider,
        ps.provider_series_id,
        cs.description,
        cs.image,
        cs.language,
        ps.quality,
        cs.country,
        cs.year,
        ps.source_url,
        ps.created_at,
        ps.updated_at
      FROM provider_series ps
      JOIN canonical_series cs ON cs.id = ps.canonical_series_id
      WHERE ps.canonical_series_id = $1 AND ps.active = TRUE
      ORDER BY ps.id ASC
      LIMIT 1
    `, [id]);
    return result.rows[0] ? normalizeRow(result.rows[0]) : null;
  }

  async getSeriesEpisodes(id) {
    const series = await this.providerSeriesByCanonicalId(id);
    if (!series) return null;
    const result = await this.pool.query(`
      SELECT
        pe.id,
        pe.provider,
        pe.provider_episode_id,
        ce.episode_number,
        ce.title,
        ce.description,
        ce.image,
        pe.source_url,
        COUNT(pc.id)::integer AS watch_option_count
      FROM provider_episodes pe
      JOIN canonical_episodes ce ON ce.id = pe.canonical_episode_id
      LEFT JOIN playback_candidates pc
        ON pc.provider_episode_id = pe.id AND pc.status = 'active'
      WHERE pe.provider_series_id = $1 AND pe.active = TRUE
      GROUP BY pe.id, ce.id
      ORDER BY ce.episode_number ASC
    `, [series.provider_series_db_id]);
    const cleanSeries = { ...series };
    delete cleanSeries.provider_series_db_id;
    return {
      series: cleanSeries,
      episodes: result.rows.map(normalizeRow)
    };
  }

  async getSeries(id) {
    const detail = await this.getSeriesEpisodes(id);
    if (!detail) return null;
    return {
      ...detail.series,
      episode_count: detail.episodes.length,
      episodes: detail.episodes
    };
  }

  async getEpisode(id) {
    const episodeResult = await this.pool.query(`
      SELECT
        pe.id,
        pe.provider,
        pe.provider_episode_id,
        ce.episode_number,
        ce.title,
        ce.description,
        ce.image,
        pe.source_url,
        pe.created_at,
        pe.updated_at,
        cs.title AS series_title
      FROM provider_episodes pe
      JOIN canonical_episodes ce ON ce.id = pe.canonical_episode_id
      JOIN canonical_series cs ON cs.id = ce.canonical_series_id
      WHERE pe.id = $1
    `, [id]);
    if (!episodeResult.rows[0]) return null;

    const options = await this.pool.query(`
      SELECT
        pc.id,
        pc.provider,
        pc.watch_id,
        pc.quality,
        COALESCE(pc.locator->>'page_url', pc.locator->>'embed_url') AS page_url,
        pc.created_at,
        pc.updated_at
      FROM playback_candidates pc
      WHERE pc.provider_episode_id = $1
        AND pc.status = 'active'
      ORDER BY pc.quality DESC NULLS LAST, pc.priority ASC, pc.id ASC
    `, [id]);

    return {
      ...normalizeRow(episodeResult.rows[0]),
      watch_options: options.rows.map(normalizeRow)
    };
  }
}

function createLibraryReadRepository(env = process.env) {
  const { DRIVERS, databaseDriver } = require("../db/config");
  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("../db/postgres");
    return new PostgresLibraryReadRepository(getPool(env));
  }
  return new SqliteLibraryReadRepository(require("../db/schema"));
}

module.exports = {
  SqliteLibraryReadRepository,
  PostgresLibraryReadRepository,
  createLibraryReadRepository,
  normalizeRow
};
