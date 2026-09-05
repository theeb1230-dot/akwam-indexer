const express = require("express");
const logger = require("../observability/logger");
const {
  createCanonicalReadRepository
} = require("../repositories/canonical-read-repository");

function createCanonicalRouter(options = {}) {
  const router = express.Router();
  const repository =
    options.repository ||
    createCanonicalReadRepository(options.env || process.env);

  router.get("/series", async (req, res) => {
    try {
      const items = await repository.listSeries();
      res.json({ count: items.length, items });
    } catch (error) {
      logger.error("canonical_series_failed", { request_id: req.requestId, error_code: error.code || "CANONICAL_SERIES_FAILED" });
      res.status(500).json({
        error: "CANONICAL_SERIES_FAILED",
        message: "تعذر تحميل بيانات المحتوى الآن. حاول مرة أخرى."
      });
    }
  });

  router.get("/series/:id/episodes", async (req, res) => {
    try {
      const result = await repository.getSeriesEpisodes(req.params.id);
      if (!result) {
        return res.status(404).json({
          error: "CANONICAL_SERIES_NOT_FOUND"
        });
      }

      res.json({
        series: result.series,
        count: result.episodes.length,
        episodes: result.episodes
      });
    } catch (error) {
      logger.error("canonical_episodes_failed", { request_id: req.requestId, error_code: error.code || "CANONICAL_EPISODES_FAILED" });
      res.status(500).json({
        error: "CANONICAL_EPISODES_FAILED",
        message: "تعذر تحميل بيانات المحتوى الآن. حاول مرة أخرى."
      });
    }
  });

  router.get("/episodes/:id/playback", async (req, res) => {
    try {
      const result = await repository.getEpisodePlayback(req.params.id);
      if (!result) {
        return res.status(404).json({
          error: "CANONICAL_EPISODE_NOT_FOUND"
        });
      }

      res.json({
        episode: result.episode,
        playback_option_count: result.fallbackPlan.length,
        fallback_plan: result.fallbackPlan
      });
    } catch (error) {
      logger.error("canonical_playback_failed", { request_id: req.requestId, error_code: error.code || "CANONICAL_PLAYBACK_FAILED" });
      res.status(500).json({
        error: "CANONICAL_PLAYBACK_FAILED",
        message: "تعذر تحميل بيانات المحتوى الآن. حاول مرة أخرى."
      });
    }
  });

  return router;
}

module.exports = createCanonicalRouter();
module.exports.createCanonicalRouter = createCanonicalRouter;
