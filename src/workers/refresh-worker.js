const {
  createRefreshSeriesRepository
} = require("../repositories/refresh-series-repository");

const logger = require("../observability/logger");const jobs = require("../services/job-manager");
const { importSeries } = require("../services/importer");
const { runWorker } = require("./worker-runner");
const {
  enqueueDueRefreshJobs
} = require("../services/refresh-scheduler");

async function refreshAll(job, options = {}) {
  const repository =
    options.repository ||
    createRefreshSeriesRepository(options.env || process.env);
  const importer = options.importSeries || importSeries;
  const jobManager = options.jobs || jobs;
  const series = await repository.listAllSeries();

  await jobManager.start(job.id, series.length);
  const results = [];

  for (const item of series) {
    await jobManager.setCurrentEpisode(job.id, {
      library_series_id: item.id,
      provider: item.provider,
      provider_series_id: item.provider_series_id,
      title: item.title
    });

    try {
      const result = await importer(
        item.provider,
        item.provider_series_id
      );
      results.push(result);
      await jobManager.episodeCompleted(job.id);
    } catch (error) {
      await jobManager.episodeFailed(job.id, {
        library_series_id: item.id,
        message: error.message
      });
    }
  }

  await jobManager.complete(job.id, {
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
  const schedulerMs = Number(process.env.REFRESH_SCHEDULER_MS || 60000);
  const timer = setInterval(async () => {
    try {
      await enqueueDueRefreshJobs();
    } catch (error) {
      logger.error("refresh_schedule_failed", { error: error.code || error.message });
    }
  }, schedulerMs);

  timer.unref?.();
  void enqueueDueRefreshJobs().catch(error => logger.error("refresh_schedule_failed", { error: error.code || error.message }));

  return runWorker({
    role: "refresh-worker",
    types: ["import", "refresh", "refresh-all"],
    handle: handleRefreshJob,
    leaseMs: Number(process.env.JOB_LEASE_MS || 60000),
    pollMs: Number(process.env.JOB_POLL_MS || 1000),
    ...options
  }).finally(() => clearInterval(timer));
}

module.exports = {
  refreshAll,
  handleRefreshJob,
  startRefreshWorker
};
