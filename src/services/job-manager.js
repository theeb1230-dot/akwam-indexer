const { randomUUID } = require("node:crypto");
const db = require("../db/schema");

function json(value, fallback) {
  try {
    return value
      ? JSON.parse(value)
      : fallback;
  } catch {
    return fallback;
  }
}

function encode(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function hydrate(row) {
  if (!row) return null;

  return {
    id: row.id,
    type: row.type,
    provider: row.provider,
    provider_series_id: row.provider_series_id,
    status: row.status,
    total: row.total,
    completed: row.completed,
    failed: row.failed,
    progress: row.progress,
    current_episode: json(row.current_item_json, null),
    result: json(row.result_json, null),
    errors: json(row.errors_json, []),
    payload: json(row.payload_json, {}),
    dedupe_key: row.dedupe_key,
    cancel_requested: Boolean(row.cancel_requested),
    attempts: row.attempts,
    max_attempts: row.max_attempts,
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
  return Math.min(100, Math.round(
    ((completed + failed) / total) * 100
  ));
}

class JobManager {
  create(data = {}) {
    const id = data.id || randomUUID();

    db.prepare(`
      INSERT INTO runtime_jobs (
        id, type, provider, provider_series_id,
        payload_json, dedupe_key, max_attempts, available_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.type || "import",
      data.provider || null,
      data.provider_series_id
        ? String(data.provider_series_id)
        : null,
      encode(data.payload, {}),
      data.dedupe_key || null,
      Number(data.max_attempts || 3),
      data.available_at || new Date().toISOString()
    );

    return this.get(id);
  }

  enqueueUnique(data = {}) {
    if (!data.dedupe_key) {
      return {
        created: true,
        job: this.create(data)
      };
    }

    const existing = db.prepare(`
      SELECT * FROM runtime_jobs
      WHERE dedupe_key = ?
        AND status IN ('queued', 'running')
      LIMIT 1
    `).get(data.dedupe_key);

    if (existing) {
      return {
        created: false,
        job: hydrate(existing)
      };
    }

    try {
      return {
        created: true,
        job: this.create(data)
      };
    } catch (error) {
      if (error.code !== "SQLITE_CONSTRAINT_UNIQUE") {
        throw error;
      }

      return {
        created: false,
        job: hydrate(db.prepare(`
          SELECT * FROM runtime_jobs
          WHERE dedupe_key = ?
            AND status IN ('queued', 'running')
          LIMIT 1
        `).get(data.dedupe_key))
      };
    }
  }

  get(id) {
    return hydrate(db.prepare(`
      SELECT * FROM runtime_jobs WHERE id = ?
    `).get(id));
  }

  getAll() {
    return db.prepare(`
      SELECT * FROM runtime_jobs ORDER BY created_at DESC
    `).all().map(hydrate);
  }

  start(id, total = 0) {
    db.prepare(`
      UPDATE runtime_jobs
      SET status = 'running', total = ?,
          started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(Number(total) || 0, id);
    return this.get(id);
  }

  setTotal(id, total) {
    const job = this.get(id);
    if (!job) return null;
    const value = Number(total) || 0;
    db.prepare(`
      UPDATE runtime_jobs SET total = ?, progress = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(value, calculate(value, job.completed, job.failed), id);
    return this.get(id);
  }

  setCurrentEpisode(id, item) {
    db.prepare(`
      UPDATE runtime_jobs SET current_item_json = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(encode(item, null), id);
    return this.get(id);
  }

  episodeCompleted(id) {
    const job = this.get(id);
    if (!job) return null;
    const completed = job.completed + 1;
    db.prepare(`
      UPDATE runtime_jobs SET completed = ?, progress = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(completed, calculate(job.total, completed, job.failed), id);
    return this.get(id);
  }

  episodeFailed(id, errorData = {}) {
    const job = this.get(id);
    if (!job) return null;
    const failed = job.failed + 1;
    const errors = [...job.errors, {
      ...errorData,
      time: new Date().toISOString()
    }];
    db.prepare(`
      UPDATE runtime_jobs SET failed = ?, errors_json = ?,
        progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(
      failed,
      encode(errors, []),
      calculate(job.total, job.completed, failed),
      id
    );
    return this.get(id);
  }

  complete(id, result = null) {
    const job = this.get(id);
    if (!job) return null;
    db.prepare(`
      UPDATE runtime_jobs SET status = ?, result_json = ?,
        current_item_json = NULL,
        progress = CASE WHEN total > 0 THEN 100 ELSE progress END,
        worker_id = NULL, lease_expires_at = NULL,
        finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      job.failed > 0 ? "completed_with_errors" : "completed",
      encode(result, null),
      id
    );
    return this.get(id);
  }

  fail(id, error) {
    const job = this.get(id);
    if (!job) return null;
    const errors = [...job.errors, {
      message: error?.message || String(error),
      time: new Date().toISOString()
    }];
    db.prepare(`
      UPDATE runtime_jobs SET status = 'failed', errors_json = ?,
        current_item_json = NULL, worker_id = NULL,
        lease_expires_at = NULL, finished_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(encode(errors, []), id);
    return this.get(id);
  }

  claimNext(workerId, types, options = {}) {
    const allowed = [...new Set(types || [])];
    if (!workerId || !allowed.length) return null;

    const now = options.now || new Date();
    const leaseMs = Number(options.leaseMs || 60000);
    const placeholders = allowed.map(() => "?").join(", ");

    return db.transaction(() => {
      const row = db.prepare(`
        SELECT id FROM runtime_jobs
        WHERE type IN (${placeholders})
          AND datetime(available_at) <= datetime(?)
          AND attempts < max_attempts
          AND cancel_requested = 0
          AND (
            status = 'queued'
            OR (status = 'running' AND datetime(lease_expires_at) < datetime(?))
          )
        ORDER BY created_at ASC LIMIT 1
      `).get(...allowed, now.toISOString(), now.toISOString());

      if (!row) return null;

      const lease = new Date(now.getTime() + leaseMs).toISOString();
      const changed = db.prepare(`
        UPDATE runtime_jobs SET status = 'running', worker_id = ?,
          lease_expires_at = ?, attempts = attempts + 1,
          started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (
          status = 'queued' OR datetime(lease_expires_at) < datetime(?)
        )
      `).run(workerId, lease, row.id, now.toISOString());

      return changed.changes === 1 ? this.get(row.id) : null;
    })();
  }

  heartbeat(id, workerId, leaseMs = 60000) {
    const lease = new Date(Date.now() + leaseMs).toISOString();
    return db.prepare(`
      UPDATE runtime_jobs SET lease_expires_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND worker_id = ? AND status = 'running'
    `).run(lease, id, workerId).changes === 1;
  }

  requeue(id, workerId, delayMs = 0) {
    const available = new Date(Date.now() + delayMs).toISOString();
    return db.prepare(`
      UPDATE runtime_jobs SET status = 'queued', worker_id = NULL,
        lease_expires_at = NULL, available_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND worker_id = ? AND status = 'running'
    `).run(available, id, workerId).changes === 1;
  }

  requestCancel(id) {
    const job = this.get(id);
    if (!job) return null;

    if (job.status === "queued") {
      db.prepare(`
        UPDATE runtime_jobs
        SET status = 'cancelled', cancel_requested = 1,
            finished_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);
    } else if (job.status === "running") {
      db.prepare(`
        UPDATE runtime_jobs
        SET cancel_requested = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);
    }

    return this.get(id);
  }

  isCancellationRequested(id) {
    return Boolean(this.get(id)?.cancel_requested);
  }

  cancel(id, result = null) {
    db.prepare(`
      UPDATE runtime_jobs
      SET status = 'cancelled', cancel_requested = 1,
          result_json = ?, worker_id = NULL,
          lease_expires_at = NULL,
          finished_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(encode(result, null), id);
    return this.get(id);
  }
}

module.exports = new JobManager();
