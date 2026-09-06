function normalizeRow(row) {
  if (!row) return row;
  const output = { ...row };
  for (const key of [
    "id",
    "canonical_series_id",
    "season_number",
    "episode_number",
    "episode_count",
    "watch_count",
    "download_count",
    "resolvable_count"
  ]) {
    if (output[key] != null) output[key] = Number(output[key]);
  }
  return output;
}

class SqliteV1ReadRepository {
  constructor(db) {
    if (!db?.prepare) throw new TypeError("SQLITE_DATABASE_REQUIRED");
    this.db = db;
  }

  async searchSeries(query) {
    const pattern = `%${query.replace(/[\\%_]/g, value => `\\${value}`)}%`;
    return this.db.prepare(`
      SELECT cs.id, cs.title, cs.original_title, cs.description, cs.image,
        cs.content_type, cs.language, cs.country, cs.year, cs.status,
        COUNT(DISTINCT ce.id) AS episode_count
      FROM canonical_series cs
      LEFT JOIN canonical_episodes ce ON ce.canonical_series_id = cs.id
      WHERE cs.status != 'deleted'
        AND (cs.title LIKE ? ESCAPE '\\' OR cs.original_title LIKE ? ESCAPE '\\')
      GROUP BY cs.id
      ORDER BY CASE WHEN lower(cs.title) = lower(?) THEN 0 ELSE 1 END,
        cs.updated_at DESC, cs.id
      LIMIT 50
    `).all(pattern, pattern, query).map(normalizeRow);
  }

  async getSeries(id) {
    return normalizeRow(this.db.prepare(`
      SELECT cs.id, cs.title, cs.original_title, cs.description, cs.image,
        cs.content_type, cs.language, cs.country, cs.year, cs.status,
        COUNT(DISTINCT ce.id) AS episode_count
      FROM canonical_series cs
      LEFT JOIN canonical_episodes ce ON ce.canonical_series_id = cs.id
      WHERE cs.id = ? AND cs.status != 'deleted'
      GROUP BY cs.id
    `).get(id));
  }

  async listEpisodes(id) {
    const series = this.db.prepare(
      "SELECT id FROM canonical_series WHERE id = ? AND status != 'deleted'"
    ).get(id);
    if (!series) return null;

    const rows = this.db.prepare(`
      SELECT ce.id, ce.canonical_series_id, ce.season_number,
        ce.episode_number, ce.title, ce.description, ce.image,
        COUNT(DISTINCT CASE WHEN po.can_watch = 1 AND po.status = 'active' THEN po.id END) AS watch_count,
        COUNT(DISTINCT CASE WHEN po.can_download = 1 AND po.status = 'active' THEN po.id END) AS download_count,
        COUNT(DISTINCT CASE WHEN pe.active = 1 THEN pe.id END) AS resolvable_count
      FROM canonical_episodes ce
      LEFT JOIN provider_episodes pe
        ON pe.canonical_episode_id = ce.id AND pe.active = 1
      LEFT JOIN playback_options po ON po.provider_episode_id = pe.id
      WHERE ce.canonical_series_id = ?
      GROUP BY ce.id
      ORDER BY ce.season_number, ce.episode_number, ce.id
    `).all(id).map(normalizeRow);
    return rows;
  }

  async getEpisode(id) {
    return normalizeRow(this.db.prepare(`
      SELECT ce.id, ce.canonical_series_id, ce.season_number,
        ce.episode_number, ce.title, ce.description, ce.image,
        COUNT(DISTINCT CASE WHEN po.can_watch = 1 AND po.status = 'active' THEN po.id END) AS watch_count,
        COUNT(DISTINCT CASE WHEN po.can_download = 1 AND po.status = 'active' THEN po.id END) AS download_count,
        COUNT(DISTINCT CASE WHEN pe.active = 1 THEN pe.id END) AS resolvable_count
      FROM canonical_episodes ce
      LEFT JOIN provider_episodes pe
        ON pe.canonical_episode_id = ce.id AND pe.active = 1
      LEFT JOIN playback_options po ON po.provider_episode_id = pe.id
      WHERE ce.id = ?
      GROUP BY ce.id
    `).get(id));
  }
}

class PostgresV1ReadRepository {
  constructor(pool) {
    if (!pool?.query) throw new TypeError("POSTGRES_POOL_REQUIRED");
    this.pool = pool;
  }

  async searchSeries(query) {
    const escaped = query.replace(/[\\%_]/g, value => `\\${value}`);
    const result = await this.pool.query(`
      SELECT cs.id, cs.title, cs.original_title, cs.description, cs.image,
        cs.content_type, cs.language, cs.country, cs.year, cs.status,
        COUNT(DISTINCT ce.id)::integer AS episode_count
      FROM canonical_series cs
      LEFT JOIN canonical_episodes ce ON ce.canonical_series_id = cs.id
      WHERE cs.status != 'deleted'
        AND (cs.title ILIKE $1 ESCAPE '\\' OR cs.original_title ILIKE $1 ESCAPE '\\')
      GROUP BY cs.id
      ORDER BY CASE WHEN lower(cs.title) = lower($2) THEN 0 ELSE 1 END,
        cs.updated_at DESC, cs.id
      LIMIT 50
    `, [`%${escaped}%`, query]);
    return result.rows.map(normalizeRow);
  }

  async getSeries(id) {
    const result = await this.pool.query(`
      SELECT cs.id, cs.title, cs.original_title, cs.description, cs.image,
        cs.content_type, cs.language, cs.country, cs.year, cs.status,
        COUNT(DISTINCT ce.id)::integer AS episode_count
      FROM canonical_series cs
      LEFT JOIN canonical_episodes ce ON ce.canonical_series_id = cs.id
      WHERE cs.id = $1 AND cs.status != 'deleted'
      GROUP BY cs.id
    `, [id]);
    return normalizeRow(result.rows[0]);
  }

  async listEpisodes(id) {
    const series = await this.pool.query(
      "SELECT id FROM canonical_series WHERE id = $1 AND status != 'deleted'",
      [id]
    );
    if (!series.rows[0]) return null;

    const result = await this.pool.query(`
      SELECT ce.id, ce.canonical_series_id, ce.season_number,
        ce.episode_number, ce.title, ce.description, ce.image,
        COUNT(DISTINCT CASE WHEN po.can_watch = TRUE AND po.status = 'active' THEN po.id END)::integer AS watch_count,
        COUNT(DISTINCT CASE WHEN po.can_download = TRUE AND po.status = 'active' THEN po.id END)::integer AS download_count,
        COUNT(DISTINCT CASE WHEN pe.active = TRUE THEN pe.id END)::integer AS resolvable_count
      FROM canonical_episodes ce
      LEFT JOIN provider_episodes pe
        ON pe.canonical_episode_id = ce.id AND pe.active = TRUE
      LEFT JOIN playback_options po ON po.provider_episode_id = pe.id
      WHERE ce.canonical_series_id = $1
      GROUP BY ce.id
      ORDER BY ce.season_number, ce.episode_number, ce.id
    `, [id]);
    return result.rows.map(normalizeRow);
  }

  async getEpisode(id) {
    const result = await this.pool.query(`
      SELECT ce.id, ce.canonical_series_id, ce.season_number,
        ce.episode_number, ce.title, ce.description, ce.image,
        COUNT(DISTINCT CASE WHEN po.can_watch = TRUE AND po.status = 'active' THEN po.id END)::integer AS watch_count,
        COUNT(DISTINCT CASE WHEN po.can_download = TRUE AND po.status = 'active' THEN po.id END)::integer AS download_count,
        COUNT(DISTINCT CASE WHEN pe.active = TRUE THEN pe.id END)::integer AS resolvable_count
      FROM canonical_episodes ce
      LEFT JOIN provider_episodes pe
        ON pe.canonical_episode_id = ce.id AND pe.active = TRUE
      LEFT JOIN playback_options po ON po.provider_episode_id = pe.id
      WHERE ce.id = $1
      GROUP BY ce.id
    `, [id]);
    return normalizeRow(result.rows[0]);
  }
}

function createV1ReadRepository(env = process.env) {
  const { DRIVERS, databaseDriver } = require("../db/config");
  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("../db/postgres");
    return new PostgresV1ReadRepository(getPool(env));
  }
  return new SqliteV1ReadRepository(require("../db/schema"));
}

module.exports = {
  SqliteV1ReadRepository,
  PostgresV1ReadRepository,
  createV1ReadRepository,
  normalizeRow
};
