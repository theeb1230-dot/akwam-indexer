const db = require("../db/schema");
const jobs = require("./job-manager");

function dueSeries(options = {}) {
  const now = options.now || new Date();
  const ttlMs = Number(options.ttlMs || process.env.REFRESH_TTL_MS || 21600000);
  const cutoff = new Date(now.getTime() - ttlMs).toISOString();
  const limit = Math.max(1, Math.min(200, Number(options.limit || 20)));

  return db.prepare(`
    SELECT id, provider, provider_series_id, title, updated_at
    FROM series
    WHERE datetime(updated_at) <= datetime(?)
    ORDER BY updated_at ASC, id ASC
    LIMIT ?
  `).all(cutoff, limit);
}

async function enqueueDueRefreshJobs(options = {}) {
  const rows = dueSeries(options);
  let queued = 0;
  let deduplicated = 0;

  for (const row of rows) {
    const result = await jobs.enqueueUnique({
      type: "refresh",
      provider: row.provider,
      provider_series_id: row.provider_series_id,
      dedupe_key: `refresh:${row.provider}:${row.provider_series_id}`,
      payload: {
        library_series_id: row.id,
        reason: "stale_ttl"
      },
      max_attempts: 3
    });

    if (result.created) queued += 1;
    else deduplicated += 1;
  }

  return { due: rows.length, queued, deduplicated };
}

module.exports = {
  dueSeries,
  enqueueDueRefreshJobs
};
