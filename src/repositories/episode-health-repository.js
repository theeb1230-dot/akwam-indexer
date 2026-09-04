class SqliteEpisodeHealthRepository {
  constructor(db) {
    if (!db?.prepare) throw new TypeError("SQLITE_DATABASE_REQUIRED");
    this.db = db;
  }

  async dueEpisodes({ now, limit }) {
    return this.db.prepare(`
      SELECT
        ce.id AS canonical_episode_id,
        cs.title,
        ck.canonical_key,
        ce.season_number,
        ce.episode_number
      FROM canonical_episodes ce
      JOIN canonical_series cs
        ON cs.id = ce.canonical_series_id
      JOIN canonical_keys ck
        ON ck.canonical_series_id = cs.id
      LEFT JOIN episode_health_schedule hs
        ON hs.canonical_episode_id = ce.id
      WHERE ce.episode_number IS NOT NULL
        AND (
          hs.canonical_episode_id IS NULL
          OR datetime(hs.next_check_at) <= datetime(?)
        )
      ORDER BY
        COALESCE(hs.next_check_at, ce.created_at) ASC,
        ce.id ASC
      LIMIT ?
    `).all(now, limit);
  }

  async storeEpisodeHealth({ episodeId, status, nextCheckAt, jobId }) {
    const failed = status === "PLAYBACK_VERIFIED" ? 0 : 1;
    this.db.prepare(`
      INSERT INTO episode_health_schedule (
        canonical_episode_id, last_status, last_checked_at,
        next_check_at, last_job_id, consecutive_failures, updated_at
      ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(canonical_episode_id)
      DO UPDATE SET
        last_status = excluded.last_status,
        last_checked_at = CURRENT_TIMESTAMP,
        next_check_at = excluded.next_check_at,
        last_job_id = excluded.last_job_id,
        consecutive_failures = CASE
          WHEN excluded.last_status = 'PLAYBACK_VERIFIED' THEN 0
          ELSE episode_health_schedule.consecutive_failures + 1
        END,
        updated_at = CURRENT_TIMESTAMP
    `).run(episodeId, status, nextCheckAt, jobId, failed);
  }
}

class PostgresEpisodeHealthRepository {
  constructor(pool) {
    if (!pool?.query) throw new TypeError("POSTGRES_POOL_REQUIRED");
    this.pool = pool;
  }

  async dueEpisodes({ now, limit }) {
    const result = await this.pool.query(`
      SELECT
        ce.id AS canonical_episode_id,
        cs.title,
        ck.canonical_key,
        ce.season_number,
        ce.episode_number
      FROM canonical_episodes ce
      JOIN canonical_series cs
        ON cs.id = ce.canonical_series_id
      JOIN canonical_keys ck
        ON ck.canonical_series_id = cs.id
      LEFT JOIN episode_health_schedule hs
        ON hs.canonical_episode_id = ce.id
      WHERE ce.episode_number IS NOT NULL
        AND (
          hs.canonical_episode_id IS NULL
          OR hs.next_check_at <= $1::timestamptz
        )
      ORDER BY
        COALESCE(hs.next_check_at, ce.created_at) ASC,
        ce.id ASC
      LIMIT $2
    `, [now, limit]);

    return result.rows.map(row => ({
      ...row,
      canonical_episode_id: Number(row.canonical_episode_id),
      season_number: Number(row.season_number),
      episode_number: Number(row.episode_number)
    }));
  }

  async storeEpisodeHealth({ episodeId, status, nextCheckAt, jobId }) {
    await this.pool.query(`
      INSERT INTO episode_health_schedule (
        canonical_episode_id, last_status, last_checked_at,
        next_check_at, last_job_id, consecutive_failures, updated_at
      ) VALUES (
        $1, $2, NOW(), $3::timestamptz, $4::uuid,
        CASE WHEN $2 = 'PLAYBACK_VERIFIED' THEN 0 ELSE 1 END,
        NOW()
      )
      ON CONFLICT(canonical_episode_id)
      DO UPDATE SET
        last_status = excluded.last_status,
        last_checked_at = NOW(),
        next_check_at = excluded.next_check_at,
        last_job_id = excluded.last_job_id,
        consecutive_failures = CASE
          WHEN excluded.last_status = 'PLAYBACK_VERIFIED' THEN 0
          ELSE episode_health_schedule.consecutive_failures + 1
        END,
        updated_at = NOW()
    `, [episodeId, status, nextCheckAt, jobId]);
  }
}

function createEpisodeHealthRepository(env = process.env) {
  const { DRIVERS, databaseDriver } = require("../db/config");
  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("../db/postgres");
    return new PostgresEpisodeHealthRepository(getPool(env));
  }
  return new SqliteEpisodeHealthRepository(require("../db/schema"));
}

module.exports = {
  SqliteEpisodeHealthRepository,
  PostgresEpisodeHealthRepository,
  createEpisodeHealthRepository
};
