const express = require("express");

const db = require("../db/schema");
const jobs = require("../services/job-manager");

const {
  runImportJob
} = require("../services/importer");

const router = express.Router();

/*
 * POST /api/library/series/:id/refresh
 *
 * يحدث مسلسل موجود في مكتبة ذيب
 * بالاعتماد على provider + provider_series_id
 * المخزنة في قاعدة البيانات.
 */
router.post(
  "/series/:id/refresh",
  (req, res) => {
    try {
      const librarySeriesId =
        Number(req.params.id);

      if (
        !Number.isInteger(
          librarySeriesId
        ) ||
        librarySeriesId <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              "INVALID_SERIES_ID"
          });
      }

      const series =
        db.prepare(`
          SELECT
            id,
            provider,
            provider_series_id,
            title

          FROM series

          WHERE id = ?
        `).get(
          librarySeriesId
        );

      if (!series) {
        return res
          .status(404)
          .json({
            error:
              "SERIES_NOT_FOUND"
          });
      }

      const existingJob =
        jobs.getAll().find(job => {
          return (
            job.type === "refresh" &&
            job.provider ===
              series.provider &&
            job.provider_series_id ===
              String(
                series.provider_series_id
              ) &&
            (
              job.status === "queued" ||
              job.status === "running"
            )
          );
        });

      if (existingJob) {
        return res
          .status(409)
          .json({
            error:
              "REFRESH_ALREADY_RUNNING",

            job:
              existingJob
          });
      }

      const job =
        jobs.create({
          type: "refresh",

          provider:
            series.provider,

          provider_series_id:
            series.provider_series_id
        });

      setImmediate(() => {
        runImportJob(
          job.id,
          series.provider,
          series.provider_series_id
        ).catch(error => {
          console.error(
            "Refresh job failed:",
            error.message
          );
        });
      });

      res.status(202).json({
        message:
          "Refresh queued",

        job_id:
          job.id,

        status:
          job.status,

        library_series_id:
          series.id,

        title:
          series.title,

        provider:
          series.provider,

        provider_series_id:
          String(
            series.provider_series_id
          ),

        progress_url:
          `/api/import/jobs/${job.id}`
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "REFRESH_FAILED",

        message:
          error.message
      });
    }
  }
);

module.exports = router;
