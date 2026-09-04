const jobs = require("./job-manager");
const {
  createEpisodeHealthRepository
} = require("../repositories/episode-health-repository");

async function dueEpisodes(options = {}) {
  const now = options.now || new Date();
  const limit = Math.max(1, Math.min(500, Number(options.limit || 25)));
  const repository =
    options.repository ||
    createEpisodeHealthRepository(options.env || process.env);

  return repository.dueEpisodes({
    now: now.toISOString(),
    limit
  });
}

async function enqueueDueHealthJobs(options = {}) {
  const rows = await dueEpisodes(options);
  const queued = [];
  let deduplicated = 0;

  for (const row of rows) {
    const result = await jobs.enqueueUnique({
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
