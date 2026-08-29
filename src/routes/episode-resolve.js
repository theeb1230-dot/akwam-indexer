const express =
  require("express");

const {
  resolveEpisode
} =
  require("../services/episode-resolver");

const router =
  express.Router();

router.get(
  "/",
  async (req, res) => {
    const query =
      String(
        req.query.q ||
        req.query.query ||
        ""
      ).trim();

    if (!query) {
      return res.status(400).json({
        error:
          "SEARCH_QUERY_REQUIRED"
      });
    }

    try {
      const result =
        await resolveEpisode({
          query,

          groupKey:
            req.query.group_key ||
            null,

          season:
            req.query.season ||
            1,

          episode:
            req.query.episode
        });

      return res.json(
        result
      );
    } catch (error) {
      const status =
        error.code ===
        "EPISODE_NOT_FOUND"
          ? 404
          : 400;

      return res.status(
        status
      ).json({
        error:
          error.code ||
          error.message,

        message:
          error.message
      });
    }
  }
);

module.exports =
  router;
