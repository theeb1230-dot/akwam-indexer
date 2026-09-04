class SqliteRefreshSeriesRepository {
  constructor(db) {
    if (!db?.prepare) throw new TypeError("SQLITE_DATABASE_REQUIRED");
    this.db = db;
  }

  async dueSeries({ cutoff, limit }) {
    return this.db.prepare(`
      SELECT id, provider, provider_series_id, title, updated_at
      FROM series
      WHERE datetime(updated_at) <= datetime(?)
      ORDER BY updated_at ASC, id ASC
      LIMIT ?
    `).all(cutoff, limit);
  }
}

class PostgresRefreshSeriesRepository {
  constructor(pool) {
    if (!pool?.query) throw new TypeError("POSTGRES_POOL_REQUIRED");
    this.pool = pool;
  }

  async dueSeries({ cutoff, limit }) {
    const result = await this.pool.query(`
      SELECT
        ps.canonical_series_id AS id,
        ps.provider,
        ps.provider_series_id,
        COALESCE(ps.provider_title, cs.title) AS title,
        ps.updated_at
      FROM provider_series ps
      JOIN canonical_series cs
        ON cs.id = ps.canonical_series_id
      WHERE ps.active = TRUE
        AND ps.updated_at <= $1::timestamptz
      ORDER BY ps.updated_at ASC, ps.id ASC
      LIMIT $2
    `, [cutoff, limit]);
    return result.rows.map(row => ({
      ...row,
      id: Number(row.id)
    }));
  }
}

function createRefreshSeriesRepository(env = process.env) {
  const { DRIVERS, databaseDriver } = require("../db/config");
  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("../db/postgres");
    return new PostgresRefreshSeriesRepository(getPool(env));
  }
  return new SqliteRefreshSeriesRepository(require("../db/schema"));
}

module.exports = {
  SqliteRefreshSeriesRepository,
  PostgresRefreshSeriesRepository,
  createRefreshSeriesRepository
};
