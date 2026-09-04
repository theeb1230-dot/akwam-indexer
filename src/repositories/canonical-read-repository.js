class SqliteCanonicalReadRepository {
  constructor(db) {
    if (!db?.prepare) throw new TypeError("SQLITE_DATABASE_REQUIRED");
    this.db = db;
  }

  async listSeries() {
    return this.db.prepare(`
      SELECT cs.*, ck.canonical_key,
        COUNT(DISTINCT ps.id) AS source_count,
        COUNT(DISTINCT ce.id) AS episode_count
      FROM canonical_series cs
      LEFT JOIN canonical_keys ck
        ON ck.canonical_series_id = cs.id
      LEFT JOIN provider_series ps
        ON ps.canonical_series_id = cs.id
      LEFT JOIN canonical_episodes ce
        ON ce.canonical_series_id = cs.id
      GROUP BY cs.id
      ORDER BY cs.updated_at DESC
    `).all();
  }

  async getSeriesEpisodes(id) {
    const series = this.db.prepare(`
      SELECT cs.*, ck.canonical_key
      FROM canonical_series cs
      LEFT JOIN canonical_keys ck
        ON ck.canonical_series_id = cs.id
      WHERE cs.id = ?
    `).get(id);

    if (!series) return null;

    const episodes = this.db.prepare(`
      SELECT ce.*,
        COUNT(DISTINCT pe.id) AS source_count,
        COUNT(DISTINCT pc.id) AS playback_option_count
      FROM canonical_episodes ce
      LEFT JOIN provider_episodes pe
        ON pe.canonical_episode_id = ce.id
      LEFT JOIN playback_candidates pc
        ON pc.canonical_episode_id = ce.id
        AND pc.status = 'active'
      WHERE ce.canonical_series_id = ?
      GROUP BY ce.id
      ORDER BY ce.season_number, ce.episode_number
    `).all(series.id);

    return { series, episodes };
  }

  async getEpisodePlayback(id) {
    const episode = this.db.prepare(`
      SELECT * FROM canonical_episodes WHERE id = ?
    `).get(id);

    if (!episode) return null;

    const fallbackPlan = this.db.prepare(`
      SELECT pc.provider, pe.provider_episode_id,
        pc.watch_id, pc.server,
        pc.playback_type AS type, pc.quality,
        pc.priority AS fallback_order,
        pc.status, pc.locator_json, pc.updated_at
      FROM playback_candidates pc
      JOIN provider_episodes pe
        ON pe.id = pc.provider_episode_id
      WHERE pc.canonical_episode_id = ?
        AND pc.status = 'active'
      ORDER BY pc.priority, pc.id
    `).all(episode.id).map(item => ({
      ...item,
      locator: JSON.parse(item.locator_json || "null"),
      locator_json: undefined
    }));

    return { episode, fallbackPlan };
  }
}

class PostgresCanonicalReadRepository {
  constructor(pool) {
    if (!pool?.query) throw new TypeError("POSTGRES_POOL_REQUIRED");
    this.pool = pool;
  }

  async listSeries() {
    const result = await this.pool.query(`
      SELECT cs.*, ck.canonical_key,
        COUNT(DISTINCT ps.id)::integer AS source_count,
        COUNT(DISTINCT ce.id)::integer AS episode_count
      FROM canonical_series cs
      LEFT JOIN canonical_keys ck
        ON ck.canonical_series_id = cs.id
      LEFT JOIN provider_series ps
        ON ps.canonical_series_id = cs.id
      LEFT JOIN canonical_episodes ce
        ON ce.canonical_series_id = cs.id
      GROUP BY cs.id, ck.canonical_key
      ORDER BY cs.updated_at DESC
    `);
    return result.rows.map(normalizeRow);
  }

  async getSeriesEpisodes(id) {
    const found = await this.pool.query(`
      SELECT cs.*, ck.canonical_key
      FROM canonical_series cs
      LEFT JOIN canonical_keys ck
        ON ck.canonical_series_id = cs.id
      WHERE cs.id = $1
    `, [id]);
    if (!found.rows[0]) return null;

    const episodes = await this.pool.query(`
      SELECT ce.*,
        COUNT(DISTINCT pe.id)::integer AS source_count,
        COUNT(DISTINCT pc.id)::integer AS playback_option_count
      FROM canonical_episodes ce
      LEFT JOIN provider_episodes pe
        ON pe.canonical_episode_id = ce.id
      LEFT JOIN playback_candidates pc
        ON pc.canonical_episode_id = ce.id
        AND pc.status = 'active'
      WHERE ce.canonical_series_id = $1
      GROUP BY ce.id
      ORDER BY ce.season_number, ce.episode_number
    `, [id]);

    return {
      series: normalizeRow(found.rows[0]),
      episodes: episodes.rows.map(normalizeRow)
    };
  }

  async getEpisodePlayback(id) {
    const found = await this.pool.query(`
      SELECT * FROM canonical_episodes WHERE id = $1
    `, [id]);
    if (!found.rows[0]) return null;

    const plan = await this.pool.query(`
      SELECT pc.provider, pe.provider_episode_id,
        pc.watch_id, pc.server,
        pc.playback_type AS type, pc.quality,
        pc.priority AS fallback_order,
        pc.status, pc.locator, pc.updated_at
      FROM playback_candidates pc
      JOIN provider_episodes pe
        ON pe.id = pc.provider_episode_id
      WHERE pc.canonical_episode_id = $1
        AND pc.status = 'active'
      ORDER BY pc.priority, pc.id
    `, [id]);

    return {
      episode: normalizeRow(found.rows[0]),
      fallbackPlan: plan.rows.map(item => normalizeRow({
        ...item,
        locator: item.locator || null
      }))
    };
  }
}

function normalizeRow(row) {
  if (!row) return row;
  const numericKeys = new Set([
    "id",
    "canonical_series_id",
    "season_number",
    "episode_number",
    "source_count",
    "episode_count",
    "playback_option_count",
    "fallback_order"
  ]);
  const output = { ...row };
  for (const key of numericKeys) {
    if (output[key] != null) output[key] = Number(output[key]);
  }
  return output;
}

function createCanonicalReadRepository(env = process.env) {
  const { DRIVERS, databaseDriver } = require("../db/config");
  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("../db/postgres");
    return new PostgresCanonicalReadRepository(getPool(env));
  }
  return new SqliteCanonicalReadRepository(require("../db/schema"));
}

module.exports = {
  SqliteCanonicalReadRepository,
  PostgresCanonicalReadRepository,
  createCanonicalReadRepository,
  normalizeRow
};
