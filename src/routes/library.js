const express = require("express");
const db = require("../db/schema");

const router = express.Router();

/*
 * GET /api/library/stats
 * إحصائيات مكتبة ذيب
 */
router.get("/stats", (req, res) => {
  try {
    const series =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM series
      `).get().count;

    const episodes =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM episodes
      `).get().count;

    const watchOptions =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM watch_options
      `).get().count;

    const providers =
      db.prepare(`
        SELECT COUNT(
          DISTINCT provider
        ) AS count
        FROM series
      `).get().count;

    res.json({
      series,
      episodes,
      watch_options: watchOptions,
      providers
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "LIBRARY_STATS_FAILED",
      message: error.message
    });
  }
});

/*
 * GET /api/library/search?q=...
 */
router.get("/search", (req, res) => {
  try {
    const query =
      String(req.query.q || "")
        .trim();

    if (!query) {
      return res.status(400).json({
        error: "SEARCH_QUERY_REQUIRED",
        message:
          "Use ?q= to search the library"
      });
    }

    const pattern =
      `%${query}%`;

    const items =
      db.prepare(`
        SELECT
          s.id,
          s.provider,
          s.provider_series_id,
          s.title,
          s.description,
          s.image,
          s.language,
          s.quality,
          s.country,
          s.year,
          s.updated_at,

          COUNT(
            DISTINCT e.id
          ) AS episode_count

        FROM series s

        LEFT JOIN episodes e
          ON e.series_id = s.id

        WHERE
          s.title LIKE ?
          OR s.description LIKE ?
          OR s.country LIKE ?
          OR s.year LIKE ?

        GROUP BY s.id

        ORDER BY
          s.updated_at DESC
      `).all(
        pattern,
        pattern,
        pattern,
        pattern
      );

    res.json({
      query,
      count: items.length,
      items
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "LIBRARY_SEARCH_FAILED",
      message: error.message
    });
  }
});

/*
 * GET /api/library/series
 */
router.get("/series", (req, res) => {
  try {
    const rows =
      db.prepare(`
        SELECT
          s.id,
          s.provider,
          s.provider_series_id,
          s.title,
          s.description,
          s.image,
          s.language,
          s.quality,
          s.country,
          s.year,
          s.source_url,
          s.created_at,
          s.updated_at,

          COUNT(
            DISTINCT e.id
          ) AS episode_count

        FROM series s

        LEFT JOIN episodes e
          ON e.series_id = s.id

        GROUP BY s.id

        ORDER BY
          s.updated_at DESC
      `).all();

    res.json({
      count: rows.length,
      items: rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "LIBRARY_SERIES_FAILED",
      message: error.message
    });
  }
});

/*
 * GET /api/library/series/:id/episodes
 *
 * مهم: هذا المسار يجب أن يأتي قبل
 * /series/:id
 */
router.get(
  "/series/:id/episodes",
  (req, res) => {
    try {
      const series =
        db.prepare(`
          SELECT
            id,
            title,
            provider,
            provider_series_id

          FROM series

          WHERE id = ?
        `).get(req.params.id);

      if (!series) {
        return res.status(404).json({
          error: "SERIES_NOT_FOUND"
        });
      }

      const episodes =
        db.prepare(`
          SELECT
            e.id,
            e.provider,
            e.provider_episode_id,
            e.episode_number,
            e.title,
            e.description,
            e.image,
            e.source_url,

            COUNT(
              w.id
            ) AS watch_option_count

          FROM episodes e

          LEFT JOIN watch_options w
            ON w.episode_id = e.id

          WHERE e.series_id = ?

          GROUP BY e.id

          ORDER BY
            e.episode_number ASC
        `).all(series.id);

      res.json({
        series,
        count: episodes.length,
        episodes
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "LIBRARY_EPISODES_FAILED",

        message:
          error.message
      });
    }
  }
);

/*
 * GET /api/library/series/:id
 */
router.get(
  "/series/:id",
  (req, res) => {
    try {
      const series =
        db.prepare(`
          SELECT *
          FROM series
          WHERE id = ?
        `).get(req.params.id);

      if (!series) {
        return res.status(404).json({
          error: "SERIES_NOT_FOUND"
        });
      }

      const episodes =
        db.prepare(`
          SELECT
            id,
            provider,
            provider_episode_id,
            episode_number,
            title,
            description,
            image,
            source_url,
            created_at,
            updated_at

          FROM episodes

          WHERE series_id = ?

          ORDER BY
            episode_number ASC
        `).all(series.id);

      res.json({
        ...series,
        episode_count:
          episodes.length,
        episodes
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "LIBRARY_SERIES_DETAILS_FAILED",

        message:
          error.message
      });
    }
  }
);

/*
 * GET /api/library/episodes/:id
 */
router.get(
  "/episodes/:id",
  (req, res) => {
    try {
      const episode =
        db.prepare(`
          SELECT
            e.*,
            s.title
              AS series_title

          FROM episodes e

          JOIN series s
            ON s.id =
              e.series_id

          WHERE e.id = ?
        `).get(req.params.id);

      if (!episode) {
        return res.status(404).json({
          error: "EPISODE_NOT_FOUND"
        });
      }

      const watchOptions =
        db.prepare(`
          SELECT
            id,
            provider,
            watch_id,
            quality,
            page_url,
            created_at,
            updated_at

          FROM watch_options

          WHERE episode_id = ?

          ORDER BY
            quality DESC
        `).all(episode.id);

      res.json({
        ...episode,

        watch_options:
          watchOptions
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "LIBRARY_EPISODE_FAILED",

        message:
          error.message
      });
    }
  }
);

module.exports = router;
