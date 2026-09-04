const express = require("express");
const {
  createLibraryReadRepository
} = require("../repositories/library-read-repository");

function createLibraryRouter(options = {}) {
  const router = express.Router();
  const repository =
    options.repository ||
    createLibraryReadRepository(options.env || process.env);

  router.get("/stats", async (_req, res) => {
    try {
      res.json(await repository.stats());
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "LIBRARY_STATS_FAILED",
        message: error.message
      });
    }
  });

  router.get("/search", async (req, res) => {
    try {
      const query = String(req.query.q || "").trim();
      if (!query) {
        return res.status(400).json({
          error: "SEARCH_QUERY_REQUIRED",
          message: "Use ?q= to search the library"
        });
      }
      const items = await repository.search(query);
      res.json({ query, count: items.length, items });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "LIBRARY_SEARCH_FAILED",
        message: error.message
      });
    }
  });

  router.get("/series", async (_req, res) => {
    try {
      const rows = await repository.listSeries();
      res.json({ count: rows.length, items: rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "LIBRARY_SERIES_FAILED",
        message: error.message
      });
    }
  });

  router.get("/series/:id/episodes", async (req, res) => {
    try {
      const result = await repository.getSeriesEpisodes(req.params.id);
      if (!result) {
        return res.status(404).json({ error: "SERIES_NOT_FOUND" });
      }
      res.json({
        series: result.series,
        count: result.episodes.length,
        episodes: result.episodes
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "LIBRARY_EPISODES_FAILED",
        message: error.message
      });
    }
  });

  router.get("/series/:id", async (req, res) => {
    try {
      const series = await repository.getSeries(req.params.id);
      if (!series) {
        return res.status(404).json({ error: "SERIES_NOT_FOUND" });
      }
      res.json(series);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "LIBRARY_SERIES_DETAILS_FAILED",
        message: error.message
      });
    }
  });

  router.get("/episodes/:id", async (req, res) => {
    try {
      const episode = await repository.getEpisode(req.params.id);
      if (!episode) {
        return res.status(404).json({ error: "EPISODE_NOT_FOUND" });
      }
      res.json(episode);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "LIBRARY_EPISODE_FAILED",
        message: error.message
      });
    }
  });

  return router;
}

module.exports = createLibraryRouter();
module.exports.createLibraryRouter = createLibraryRouter;
