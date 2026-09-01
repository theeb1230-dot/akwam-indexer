const { DRIVERS, databaseDriver } = require("../db/config");

const PROVIDER_HEALTH_SQL = `SELECT provider,
  COUNT(*) AS candidates, COALESCE(SUM(success_count), 0) AS successes,
  COALESCE(SUM(failure_count), 0) AS failures,
  ROUND(AVG(avg_latency_ms)) AS avg_latency_ms,
  MAX(updated_at) AS last_updated_at
  FROM playback_health GROUP BY provider ORDER BY provider`;

const OPEN_CIRCUITS_SQL = `SELECT provider, server, playback_type,
  consecutive_failures, last_failure_reason, circuit_open_until, updated_at
  FROM playback_health WHERE circuit_open_until > CURRENT_TIMESTAMP
  ORDER BY circuit_open_until DESC LIMIT 200`;

const JOBS_SQL = `SELECT id, type, provider, status,
  total, completed, failed, progress, attempts, max_attempts, worker_id,
  lease_expires_at, available_at, created_at, started_at, finished_at, updated_at
  FROM runtime_jobs ORDER BY created_at DESC LIMIT 200`;

const PLAYBACK_SESSIONS_SQL = `SELECT state, COUNT(*) AS sessions
  FROM playback_sessions GROUP BY state ORDER BY state`;

const PLAYBACK_EVENTS_SQL = `SELECT event_type, COUNT(*) AS events
  FROM playback_session_events GROUP BY event_type ORDER BY event_type`;

class SqliteObservabilityRepository {
  constructor(db) {
    if (!db?.prepare) throw new TypeError("SQLITE_DATABASE_REQUIRED");
    this.db = db;
  }

  async providerHealth() { return this.db.prepare(PROVIDER_HEALTH_SQL).all(); }
  async openCircuits() { return this.db.prepare(OPEN_CIRCUITS_SQL).all(); }
  async recentJobs() { return this.db.prepare(JOBS_SQL).all(); }
  async playbackSummary() {
    return {
      sessions: this.db.prepare(PLAYBACK_SESSIONS_SQL).all(),
      events: this.db.prepare(PLAYBACK_EVENTS_SQL).all()
    };
  }
}

class PostgresObservabilityRepository {
  constructor(pool) {
    if (!pool?.query) throw new TypeError("POSTGRES_POOL_REQUIRED");
    this.pool = pool;
  }

  async rows(sql) { return (await this.pool.query(sql)).rows; }
  async providerHealth() { return this.rows(PROVIDER_HEALTH_SQL); }
  async openCircuits() { return this.rows(OPEN_CIRCUITS_SQL); }
  async recentJobs() { return this.rows(JOBS_SQL); }
  async playbackSummary() {
    const [sessions, events] = await Promise.all([
      this.rows(PLAYBACK_SESSIONS_SQL),
      this.rows(PLAYBACK_EVENTS_SQL)
    ]);
    return { sessions, events };
  }
}

function createObservabilityRepository(env = process.env) {
  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("../db/postgres");
    return new PostgresObservabilityRepository(getPool(env));
  }
  return new SqliteObservabilityRepository(require("../db/schema"));
}

module.exports = {
  PostgresObservabilityRepository,
  SqliteObservabilityRepository,
  createObservabilityRepository
};
