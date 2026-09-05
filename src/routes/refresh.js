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

function createRefreshRouter(options = {}) {
  const router = express.Router();
  const repository =
    options.repository ||
    createRefreshSeriesRepository(options.env || process.env);
  const jobManager = options.jobs || jobs;
  const importJob = options.runImportJob || runImportJob;
  const inline =
    options.shouldExecuteJobsInline ||
    shouldExecuteJobsInline;

  router.post("/series/:id/refresh", async (req, res) => {
    try {
      const librarySeriesId = Number(req.params.id);
      if (!Number.isInteger(librarySeriesId) || librarySeriesId <= 0) {
        return res.status(400).json({
          error: "INVALID_SERIES_ID"
        });
      }

      const seriesList = await repository.listAllSeries();
      const series = seriesList.find(item => item.id === librarySeriesId);

      if (!series) {
        return res.status(404).json({
          error: "SERIES_NOT_FOUND"
        });
      }

      const allJobs = await jobManager.getAll();
      const existingJob = allJobs.find(job =>
        job.type === "refresh" &&
        job.provider === series.provider &&
        job.provider_series_id === String(series.provider_series_id) &&
        (job.status === "queued" || job.status === "running")
      );

      if (existingJob) {
        return res.status(409).json({
          error: "REFRESH_ALREADY_RUNNING",
          job: existingJob
        });
      }

      const job = await jobManager.create({
        type: "refresh",
        provider: series.provider,
        provider_series_id: series.provider_series_id
      });

      if (inline()) {
        setImmediate(() => {
          importJob(
            job.id,
            series.provider,
            series.provider_series_id
          ).catch(error => {
            logger.error("refresh_job_failed", {
              job_id: job.id,
              provider: series.provider,
              error_code: error.code || "REFRESH_JOB_FAILED"
            });
          });
        });
      }

      return res.status(202).json({
        message: "Refresh queued",
        job_id: job.id,
        status: job.status,
        library_series_id: series.id,
        title: series.title,
        provider: series.provider,
        provider_series_id: String(series.provider_series_id),
        progress_url: `/api/import/jobs/${job.id}`
      });
    } catch (error) {
      logger.error("refresh_request_failed", {
        request_id: req.requestId,
        error_code: error.code || "REFRESH_FAILED"
      });
      return res.status(500).json({
        error: "REFRESH_FAILED",
        message: error.message
      });
    }
  });

  return router;
}

module.exports = createRefreshRouter();
module.exports.createRefreshRouter = createRefreshRouter;
