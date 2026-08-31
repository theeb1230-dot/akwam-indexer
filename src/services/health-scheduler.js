const db = require("../db/schema");
const jobs = require("./job-manager");

function dueEpisodes(options = {}) {
  const now = options.now || new Date();
  const limit = Math.max(1, Math.min(500, Number(options.limit || 25)));

  return db.prepare(`
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
        OR hs.next_check_at <= ?
      )
    ORDER BY
      COALESCE(hs.next_check_at, ce.created_at) ASC,
      ce.id ASC
    LIMIT ?
  `).all(now.toISOString(), limit);
}

function enqueueDueHealthJobs(options = {}) {
  const rows = dueEpisodes(options);
  const queued = [];
  let deduplicated = 0;

  for (const row of rows) {
    const result = jobs.enqueueUnique({
      type: "health-check",
      dedupe_key: `health:episode:${row.canonical_episode_id}`,
      payload: {
        canonical_episode_id: row.canonical_episode_id,
        query: row.title,
        group_key: row.canonical_key,
        season: row.season_number,
        episode: row.episode_number
      },
      max_attempts: 3
    });

    if (result.created) {
      queued.push(result.job);
    } else {
      deduplicated += 1;
    }
  }

  return {
    due: rows.length,
    queued: queued.length,
    deduplicated,
    jobs: queued
  };
}

module.exports = {
  dueEpisodes,
  enqueueDueHealthJobs
};
