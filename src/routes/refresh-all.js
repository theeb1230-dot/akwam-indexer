const express = require("express");

const db = require("../db/schema");
const jobs = require("../services/job-manager");

const {
  runImportJob
} = require("../services/importer");
const {
  shouldExecuteJobsInline
} = require("../config/runtime-mode");

const router = express.Router();

router.post(
  "/refresh-all",
  (req, res) => {
    try {
      const seriesList =
        db.prepare(`
          SELECT
            id,
            provider,
            provider_series_id,
            title
          FROM series
          ORDER BY id ASC
        `).all();

      if (seriesList.length === 0) {
        return res.status(400).json({
          error: "LIBRARY_EMPTY"
        });
      }

      const existing =
        jobs.getAll().find(job => {
          return (
            job.type === "refresh-all" &&
            (
              job.status === "queued" ||
              job.status === "running"
            )
          );
        });

      if (existing) {
        return res.status(409).json({
          error:
            "REFRESH_ALL_ALREADY_RUNNING",

          job: existing
        });
      }

      const parentJob =
        jobs.create({
          type: "refresh-all",
          provider: "multiple"
        });

      if (shouldExecuteJobsInline()) setImmediate(async () => {
        try {
          jobs.start(
            parentJob.id,
            seriesList.length
          );

          const results = [];

          for (
            const series
            of seriesList
          ) {
            jobs.setCurrentEpisode(
              parentJob.id,
              {
                library_series_id:
                  series.id,

                title:
                  series.title,

                provider:
                  series.provider,

                provider_series_id:
                  String(
                    series.provider_series_id
                  )
              }
            );

            try {
              const childJob =
                jobs.create({
                  type:
                    "refresh",

                  provider:
                    series.provider,

                  provider_series_id:
                    series.provider_series_id
                });

              const result =
                await runImportJob(
                  childJob.id,
                  series.provider,
                  series.provider_series_id
                );

              results.push({
                library_series_id:
                  series.id,

                title:
                  series.title,

                status:
                  result.status,

                completed:
                  result.completed,

                failed:
                  result.failed
              });

              jobs.episodeCompleted(
                parentJob.id
              );
            } catch (error) {
              results.push({
                library_series_id:
                  series.id,

                title:
                  series.title,

                status:
                  "failed",

                message:
                  error.message
              });

              jobs.episodeFailed(
                parentJob.id,
                {
                  library_series_id:
                    series.id,

                  title:
                    series.title,

                  message:
                    error.message
                }
              );
            }
          }

          jobs.complete(
            parentJob.id,
            {
              series_count:
                seriesList.length,

              results
            }
          );
        } catch (error) {
          jobs.fail(
            parentJob.id,
            error
          );

          console.error(
            "Refresh-all failed:",
            error.message
          );
        }
      });

      res.status(202).json({
        message:
          "Library refresh queued",

        job_id:
          parentJob.id,

        status:
          parentJob.status,

        series_count:
          seriesList.length,

        progress_url:
          `/api/import/jobs/${parentJob.id}`
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "REFRESH_ALL_FAILED",

        message:
          error.message
      });
    }
  }
);

module.exports = router;
