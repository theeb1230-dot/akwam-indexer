const { randomUUID } = require("node:crypto");

function hydrate(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    provider: row.provider,
    provider_series_id: row.provider_series_id,
    status: row.status,
    total: Number(row.total || 0),
    completed: Number(row.completed || 0),
    failed: Number(row.failed || 0),
    progress: Number(row.progress || 0),
    current_episode: row.current_item ?? null,
    result: row.result ?? null,
    errors: Array.isArray(row.errors) ? row.errors : [],
    payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    dedupe_key: row.dedupe_key,
    cancel_requested: Boolean(row.cancel_requested),
    attempts: Number(row.attempts || 0),
    max_attempts: Number(row.max_attempts || 0),
    worker_id: row.worker_id,
    lease_expires_at: row.lease_expires_at,
    available_at: row.available_at,
    created_at: row.created_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    updated_at: row.updated_at
  };
}

function calculate(total, completed, failed) {
  if (!total) return 0;
  return Math.min(100, Math.round(((completed + failed) / total) * 100));
}

class PostgresJobRepository {
  constructor(pool) {
    if (!pool?.query) throw new TypeError("POSTGRES_POOL_REQUIRED");
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
    return hydrate(result.rows[0]);
  }

  async get(id) {
    const result = await this.pool.query(
      "SELECT * FROM runtime_jobs WHERE id = $1",
      [id]
    );
    return hydrate(result.rows[0]);
  }

  async getAll(limit = 1000) {
    const result = await this.pool.query(`
      SELECT * FROM runtime_jobs
      ORDER BY created_at DESC
      LIMIT $1
    `, [Math.max(1, Math.min(1000, Number(limit || 1000)))]);
    return result.rows.map(hydrate);
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
      return { created: true, job: hydrate(result.rows[0]) };
    }

    const existing = await this.pool.query(`
      SELECT * FROM runtime_jobs
      WHERE dedupe_key = $1
        AND status IN ('queued', 'running')
      LIMIT 1
    `, [data.dedupe_key]);

    return { created: false, job: hydrate(existing.rows[0]) };
  }

  async start(id, total = 0) {
    const result = await this.pool.query(`
      UPDATE runtime_jobs
      SET status = 'running',
          total = $2,
          started_at = COALESCE(started_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, Number(total) || 0]);
    return hydrate(result.rows[0]);
  }

  async setTotal(id, total) {
    const job = await this.get(id);
    if (!job) return null;
    const value = Number(total) || 0;
    const result = await this.pool.query(`
      UPDATE runtime_jobs
      SET total = $2, progress = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, value, calculate(value, job.completed, job.failed)]);
    return hydrate(result.rows[0]);
  }

  async setCurrentEpisode(id, item) {
    const result = await this.pool.query(`
      UPDATE runtime_jobs
      SET current_item = $2::jsonb, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, JSON.stringify(item ?? null)]);
    return hydrate(result.rows[0]);
  }

  async episodeCompleted(id) {
    const result = await this.pool.query(`
      UPDATE runtime_jobs
      SET completed = completed + 1,
          progress = CASE
            WHEN total > 0
              THEN LEAST(100, ROUND(((completed + 1 + failed)::numeric / total) * 100)::int)
            ELSE 0
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
    return hydrate(result.rows[0]);
  }

  async episodeFailed(id, errorData = {}) {
    const entry = { ...errorData, time: new Date().toISOString() };
    const result = await this.pool.query(`
      UPDATE runtime_jobs
      SET failed = failed + 1,
          errors = COALESCE(errors, '[]'::jsonb) || $2::jsonb,
          progress = CASE
            WHEN total > 0
              THEN LEAST(100, ROUND(((completed + failed + 1)::numeric / total) * 100)::int)
            ELSE 0
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, JSON.stringify([entry])]);
    return hydrate(result.rows[0]);
  }

  async complete(id, value = null) {
    const current = await this.get(id);
    if (!current) return null;
    const status = current.failed > 0 ? "completed_with_errors" : "completed";
    const result = await this.pool.query(`
      UPDATE runtime_jobs
      SET status = $2,
          result = $3::jsonb,
          current_item = NULL,
          progress = CASE WHEN total > 0 THEN 100 ELSE progress END,
          worker_id = NULL,
          lease_expires_at = NULL,
          finished_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, status, JSON.stringify(value)]);
    return hydrate(result.rows[0]);
  }

  async fail(id, error) {
    const entry = {
      message: error?.message || String(error),
      time: new Date().toISOString()
    };
    const result = await this.pool.query(`
      UPDATE runtime_jobs
      SET status = 'failed',
          errors = COALESCE(errors, '[]'::jsonb) || $2::jsonb,
          current_item = NULL,
          worker_id = NULL,
          lease_expires_at = NULL,
          finished_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, JSON.stringify([entry])]);
    return hydrate(result.rows[0]);
  }

  async claimNext(workerId, types, options = {}) {
    const allowed = [...new Set(types || [])];
    if (!workerId || !allowed.length) return null;

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
    `, [workerId, allowed, now, leaseMs]);
    return hydrate(result.rows[0]);
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

  async requeue(id, workerId, delayMs = 0) {
    const result = await this.pool.query(`
      UPDATE runtime_jobs
      SET status = 'queued',
          worker_id = NULL,
          lease_expires_at = NULL,
          available_at = NOW() + ($3 * INTERVAL '1 millisecond'),
          updated_at = NOW()
      WHERE id = $1 AND worker_id = $2 AND status = 'running'
      RETURNING id
    `, [id, workerId, Number(delayMs)]);
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
    return hydrate(result.rows[0]);
  }

  async isCancellationRequested(id) {
    const job = await this.get(id);
    return Boolean(job?.cancel_requested);
  }

  async cancel(id, value = null) {
    const result = await this.pool.query(`
      UPDATE runtime_jobs
      SET status = 'cancelled',
          cancel_requested = TRUE,
          result = $2::jsonb,
          worker_id = NULL,
          lease_expires_at = NULL,
          finished_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, JSON.stringify(value)]);
    return hydrate(result.rows[0]);
  }
}

module.exports = {
  PostgresJobRepository,
  hydrate
};
