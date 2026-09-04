function toBool(value) {
  return value === true || value === 1 || value === "1";
}

class SqlitePlaybackHealthRepository {
  constructor(db) {
    if (!db?.prepare) throw new TypeError("SQLITE_DATABASE_REQUIRED");
    this.db = db;
  }

  async getHealth(key) {
    return this.db.prepare(`
      SELECT * FROM playback_health WHERE candidate_key = ?
    `).get(key) || null;
  }

  async getVerification(key) {
    return this.db.prepare(`
      SELECT * FROM playback_verification WHERE candidate_key = ?
    `).get(key) || null;
  }

  async upsertHealth(row) {
    this.db.prepare(`
      INSERT INTO playback_health (
        candidate_key, provider, server, playback_type, quality,
        success_count, failure_count, consecutive_failures,
        avg_latency_ms, last_status, last_failure_reason,
        last_success_at, last_failure_at, circuit_open_until, updated_at
      ) VALUES (
        @candidate_key, @provider, @server, @playback_type, @quality,
        @success_count, @failure_count, @consecutive_failures,
        @avg_latency_ms, @last_status, @last_failure_reason,
        @last_success_at, @last_failure_at, @circuit_open_until,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(candidate_key) DO UPDATE SET
        success_count = excluded.success_count,
        failure_count = excluded.failure_count,
        consecutive_failures = excluded.consecutive_failures,
        avg_latency_ms = excluded.avg_latency_ms,
        last_status = excluded.last_status,
        last_failure_reason = excluded.last_failure_reason,
        last_success_at = excluded.last_success_at,
        last_failure_at = excluded.last_failure_at,
        circuit_open_until = excluded.circuit_open_until,
        updated_at = CURRENT_TIMESTAMP
    `).run(row);
    return this.getHealth(row.candidate_key);
  }

  async upsertVerification(row) {
    this.db.prepare(`
      INSERT INTO playback_verification (
        candidate_key, provider, server, embed_status, playback_status,
        health_state, video_element_discovered, loadedmetadata, canplay,
        playing, max_current_time, latency_ms, checked_at, updated_at
      ) VALUES (
        @candidate_key, @provider, @server, @embed_status, @playback_status,
        @health_state, @video_element_discovered, @loadedmetadata, @canplay,
        @playing, @max_current_time, @latency_ms, @checked_at,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(candidate_key) DO UPDATE SET
        embed_status = excluded.embed_status,
        playback_status = excluded.playback_status,
        health_state = excluded.health_state,
        video_element_discovered = excluded.video_element_discovered,
        loadedmetadata = excluded.loadedmetadata,
        canplay = excluded.canplay,
        playing = excluded.playing,
        max_current_time = excluded.max_current_time,
        latency_ms = excluded.latency_ms,
        checked_at = excluded.checked_at,
        updated_at = CURRENT_TIMESTAMP
    `).run(row);
    return this.getVerification(row.candidate_key);
  }
}

class PostgresPlaybackHealthRepository {
  constructor(pool) {
    if (!pool?.query) throw new TypeError("POSTGRES_POOL_REQUIRED");
    this.pool = pool;
  }

  async getHealth(key) {
    const result = await this.pool.query(
      "SELECT * FROM playback_health WHERE candidate_key = $1",
      [key]
    );
    return result.rows[0] || null;
  }

  async getVerification(key) {
    const result = await this.pool.query(
      "SELECT * FROM playback_verification WHERE candidate_key = $1",
      [key]
    );
    return result.rows[0] || null;
  }

  async recordHealthResult(input) {
    const healthy = input.status === "healthy";
    const result = await this.pool.query(`
      INSERT INTO playback_health (
        candidate_key, provider, server, playback_type, quality,
        success_count, failure_count, consecutive_failures,
        avg_latency_ms, last_status, last_failure_reason,
        last_success_at, last_failure_at, circuit_open_until, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        CASE WHEN $6 THEN 1 ELSE 0 END,
        CASE WHEN $6 THEN 0 ELSE 1 END,
        CASE WHEN $6 THEN 0 ELSE 1 END,
        $7, $8, $9,
        CASE WHEN $6 THEN NOW() ELSE NULL END,
        CASE WHEN $6 THEN NULL ELSE NOW() END,
        CASE
          WHEN NOT $6 AND $10 <= 1
            THEN NOW() + ($11 * INTERVAL '1 millisecond')
          ELSE NULL
        END,
        NOW()
      )
      ON CONFLICT(candidate_key) DO UPDATE SET
        success_count = playback_health.success_count + CASE WHEN $6 THEN 1 ELSE 0 END,
        failure_count = playback_health.failure_count + CASE WHEN $6 THEN 0 ELSE 1 END,
        consecutive_failures = CASE
          WHEN $6 THEN 0
          ELSE playback_health.consecutive_failures + 1
        END,
        avg_latency_ms = ROUND(
          (
            playback_health.avg_latency_ms *
              (playback_health.success_count + playback_health.failure_count) +
            $7
          )::numeric /
          GREATEST(playback_health.success_count + playback_health.failure_count + 1, 1)
        )::int,
        last_status = $8,
        last_failure_reason = $9,
        last_success_at = CASE WHEN $6 THEN NOW() ELSE playback_health.last_success_at END,
        last_failure_at = CASE WHEN $6 THEN playback_health.last_failure_at ELSE NOW() END,
        circuit_open_until = CASE
          WHEN $6 THEN NULL
          WHEN playback_health.consecutive_failures + 1 >= $10
            THEN NOW() + ($11 * INTERVAL '1 millisecond')
          ELSE playback_health.circuit_open_until
        END,
        updated_at = NOW()
      RETURNING *
    `, [
      input.candidate_key,
      input.provider,
      input.server,
      input.playback_type,
      input.quality,
      healthy,
      Number(input.latency_ms || 0),
      input.status,
      input.reason || null,
      Number(input.failure_threshold || 5),
      Number(input.cooldown_ms || 300000)
    ]);
    return result.rows[0];
  }

  async upsertVerification(row) {
    const result = await this.pool.query(`
      INSERT INTO playback_verification (
        candidate_key, provider, server, embed_status, playback_status,
        health_state, video_element_discovered, loadedmetadata, canplay,
        playing, max_current_time, latency_ms, checked_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13, NOW()
      )
      ON CONFLICT(candidate_key) DO UPDATE SET
        embed_status = excluded.embed_status,
        playback_status = excluded.playback_status,
        health_state = excluded.health_state,
        video_element_discovered = excluded.video_element_discovered,
        loadedmetadata = excluded.loadedmetadata,
        canplay = excluded.canplay,
        playing = excluded.playing,
        max_current_time = excluded.max_current_time,
        latency_ms = excluded.latency_ms,
        checked_at = excluded.checked_at,
        updated_at = NOW()
      RETURNING *
    `, [
      row.candidate_key,
      row.provider,
      row.server,
      row.embed_status,
      row.playback_status,
      row.health_state,
      toBool(row.video_element_discovered),
      toBool(row.loadedmetadata),
      toBool(row.canplay),
      toBool(row.playing),
      Number(row.max_current_time || 0),
      Number(row.latency_ms || 0),
      row.checked_at
    ]);
    return result.rows[0];
  }
}

function createPlaybackHealthRepository(env = process.env) {
  const { DRIVERS, databaseDriver } = require("../db/config");
  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("../db/postgres");
    return new PostgresPlaybackHealthRepository(getPool(env));
  }
  return new SqlitePlaybackHealthRepository(require("../db/schema"));
}

module.exports = {
  PostgresPlaybackHealthRepository,
  SqlitePlaybackHealthRepository,
  createPlaybackHealthRepository,
  toBool
};
