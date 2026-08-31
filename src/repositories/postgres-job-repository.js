const { randomUUID } = require("node:crypto");

class PostgresJobRepository {
  constructor(pool) {
    if (!pool?.query) {
      throw new TypeError("POSTGRES_POOL_REQUIRED");
    }
    this.pool = pool;
  }

  async create(data = {}) {
    const result = await this.pool.query(`
      INSERT INTO runtime_jobs (
        id, type, provider, provider_series_id,
        payload, dedupe_key, max_attempts, available_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      RETURNING *
    `, [
      data.id || randomUUID(),
      data.type || "import",
      data.provider || null,
      data.provider_series_id ? String(data.provider_series_id) : null,
      JSON.stringify(data.payload || {}),
      data.dedupe_key || null,
      Number(data.max_attempts || 3),
      data.available_at || new Date()
    ]);
    return result.rows[0];
  }

  async get(id) {
    const result = await this.pool.query(
      "SELECT * FROM runtime_jobs WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }

  async getAll(limit = 100) {
    const result = await this.pool.query(`
      SELECT * FROM runtime_jobs
      ORDER BY created_at DESC
      LIMIT $1
    `, [Math.max(1, Math.min(1000, Number(limit || 100)))]);
    return result.rows;
  }

  async enqueueUnique(data = {}) {
    if (!data.dedupe_key) {
      return { created: true, job: await this.create(data) };
    }

    const result = await this.pool.query(`
      INSERT INTO runtime_jobs (
        id, type, provider, provider_series_id,
        payload, dedupe_key, max_attempts, available_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      ON CONFLICT (dedupe_key)
        WHERE dedupe_key IS NOT NULL
          AND status IN ('queued', 'running')
      DO NOTHING
      RETURNING *
    `, [
      data.id || randomUUID(),
      data.type || "import",
      data.provider || null,
      data.provider_series_id ? String(data.provider_series_id) : null,
      JSON.stringify(data.payload || {}),
      data.dedupe_key,
      Number(data.max_attempts || 3),
      data.available_at || new Date()
    ]);

    if (result.rows[0]) {
      return { created: true, job: result.rows[0] };
    }

    const existing = await this.pool.query(`
      SELECT * FROM runtime_jobs
      WHERE dedupe_key = $1
        AND status IN ('queued', 'running')
      LIMIT 1
    `, [data.dedupe_key]);
    return { created: false, job: existing.rows[0] || null };
  }

  async claimNext(workerId, types, options = {}) {
    const now = options.now || new Date();
    const leaseMs = Number(options.leaseMs || 60000);
    const result = await this.pool.query(`
      WITH candidate AS (
        SELECT id
        FROM runtime_jobs
        WHERE type = ANY($2::text[])
          AND available_at <= $3
          AND attempts < max_attempts
          AND cancel_requested = FALSE
          AND (
            status = 'queued'
            OR (status = 'running' AND lease_expires_at < $3)
          )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE runtime_jobs AS job
      SET status = 'running',
          worker_id = $1,
          lease_expires_at = $3 + ($4 * INTERVAL '1 millisecond'),
          attempts = job.attempts + 1,
          started_at = COALESCE(job.started_at, NOW()),
          updated_at = NOW()
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.*
    `, [workerId, types, now, leaseMs]);
    return result.rows[0] || null;
  }

  async heartbeat(id, workerId, leaseMs = 60000) {
    const result = await this.pool.query(`
      UPDATE runtime_jobs
      SET lease_expires_at = NOW() + ($3 * INTERVAL '1 millisecond'),
          updated_at = NOW()
      WHERE id = $1 AND worker_id = $2 AND status = 'running'
      RETURNING id
    `, [id, workerId, Number(leaseMs)]);
    return result.rowCount === 1;
  }

  async requestCancel(id) {
    const result = await this.pool.query(`
      UPDATE runtime_jobs
      SET cancel_requested = TRUE,
          status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
          finished_at = CASE WHEN status = 'queued' THEN NOW() ELSE finished_at END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
    return result.rows[0] || null;
  }
}

module.exports = {
  PostgresJobRepository
};
