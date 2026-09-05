const express = require("express");
const logger = require("../observability/logger");

const jobs = require("../services/job-manager");
const {
  runImportJob
} = require("../services/importer");
const {
  shouldExecuteJobsInline
} = require("../config/runtime-mode");
const {
  createRefreshSeriesRepository
} = require("../repositories/refresh-series-repository");

function createRefreshAllRouter(options = {}) {
  const router = express.Router();
  const repository =
    options.repository ||
    createRefreshSeriesRepository(options.env || process.env);
  const jobManager = options.jobs || jobs;
  const importJob = options.runImportJob || runImportJob;
  const inline =
    options.shouldExecuteJobsInline ||
    shouldExecuteJobsInline;

  router.post("/refresh-all", async (req, res) => {
    try {
      const seriesList = await repository.listAllSeries();

      if (seriesList.length === 0) {
        return res.status(400).json({
          error: "LIBRARY_EMPTY"
        });
      }

      const allJobs = await jobManager.getAll();
      const existing = allJobs.find(job =>
        job.type === "refresh-all" &&
        (job.status === "queued" || job.status === "running")
      );

      if (existing) {
        return res.status(409).json({
          error: "REFRESH_ALL_ALREADY_RUNNING",
          job: existing
        });
      }

      const parentJob = await jobManager.create({
        type: "refresh-all",
        provider: "multiple"
      });

      if (inline()) {
        setImmediate(async () => {
          try {
            await jobManager.start(parentJob.id, seriesList.length);
            const results = [];

            for (const series of seriesList) {
              await jobManager.setCurrentEpisode(parentJob.id, {
                library_series_id: series.id,
                title: series.title,
                provider: series.provider,
                provider_series_id: String(series.provider_series_id)
              });

              try {
                const childJob = await jobManager.create({
                  type: "refresh",
                  provider: series.provider,
                  provider_series_id: series.provider_series_id
                });

                const result = await importJob(
                  childJob.id,
                  series.provider,
                  series.provider_series_id
                );

                results.push({
                  library_series_id: series.id,
                  title: series.title,
                  status: result.status,
                  completed: result.completed,
                  failed: result.failed
                });

                await jobManager.episodeCompleted(parentJob.id);
              } catch (error) {
                results.push({
                  library_series_id: series.id,
                  title: series.title,
                  status: "failed",
                  message: error.message
                });

                await jobManager.episodeFailed(parentJob.id, {
                  library_series_id: series.id,
                  title: series.title,
                  message: error.message
                });
              }
            }

            await jobManager.complete(parentJob.id, {
              series_count: seriesList.length,
              results
            });
          } catch (error) {
            await jobManager.fail(parentJob.id, error);
            logger.error("refresh_all_job_failed", {
              job_id: parentJob.id,
              error_code: error.code || "REFRESH_ALL_JOB_FAILED"
            });
          }
        });
      }

      return res.status(202).json({
        message: "Library refresh queued",
        job_id: parentJob.id,
        status: parentJob.status,
        series_count: seriesList.length,
        progress_url: `/api/import/jobs/${parentJob.id}`
      });
    } catch (error) {
      logger.error("refresh_all_request_failed", {
        request_id: req.requestId,
        error_code: error.code || "REFRESH_ALL_FAILED"
      });
      return res.status(500).json({
        error: "REFRESH_ALL_FAILED",
        message: error.message
      });
    }
  });

  return router;
}

module.exports = createRefreshAllRouter();
module.exports.createRefreshAllRouter = createRefreshAllRouter;
