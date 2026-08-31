const db = require("../db/schema");
const jobs = require("../services/job-manager");
const { importSeries } = require("../services/importer");
const { runWorker } = require("./worker-runner");

async function refreshAll(job) {
  const series = db.prepare(`
    SELECT id, provider, provider_series_id, title
    FROM series ORDER BY id ASC
  `).all();

  jobs.start(job.id, series.length);
  const results = [];

  for (const item of series) {
    jobs.setCurrentEpisode(job.id, {
      library_series_id: item.id,
      provider: item.provider,
      provider_series_id: item.provider_series_id,
      title: item.title
    });

    try {
      const result = await importSeries(
        item.provider,
        item.provider_series_id
      );
      results.push(result);
      jobs.episodeCompleted(job.id);
    } catch (error) {
      jobs.episodeFailed(job.id, {
        library_series_id: item.id,
        message: error.message
      });
    }
  }

  jobs.complete(job.id, {
    series_count: series.length,
    results
  });
}

async function handleRefreshJob(job) {
  if (job.type === "refresh-all") {
    return refreshAll(job);
  }

  return importSeries(
    job.provider,
    job.provider_series_id,
    { jobId: job.id }
  );
}

function startRefreshWorker(options = {}) {
  return runWorker({
    role: "refresh-worker",
    types: ["import", "refresh", "refresh-all"],
    handle: handleRefreshJob,
    leaseMs: Number(process.env.JOB_LEASE_MS || 60000),
    pollMs: Number(process.env.JOB_POLL_MS || 1000),
    ...options
  });
}

module.exports = {
  refreshAll,
  handleRefreshJob,
  startRefreshWorker
};
