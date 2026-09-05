const express =
  require("express");
const logger = require("../observability/logger");

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
          "SEARCH_QUERY_REQUIRED",
        message:
          "اكتب عبارة بحث للمتابعة."
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

      logger.warn("episode_resolve_failed", {
        request_id: req.requestId,
        error_code: error.code || "EPISODE_RESOLVE_FAILED"
      });

      return res.status(
        status
      ).json({
        error:
          error.code ||
          "EPISODE_RESOLVE_FAILED",

        message:
          status === 404
            ? "لم نجد الحلقة المطلوبة."
            : "تعذر تحديد الحلقة المطلوبة. تحقق من البيانات وحاول مرة أخرى."
      });
    }
  }
);

module.exports =
  router;
