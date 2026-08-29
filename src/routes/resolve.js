const express =
  require("express");

const {
  resolveSeries
} =
  require("../services/series-resolver");

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

    const groupKey =
      String(
        req.query.group_key ||
        ""
      ).trim();

    if (!query) {
      return res
        .status(400)
        .json({
          error:
            "SEARCH_QUERY_REQUIRED",

          message:
            "Use /api/resolve?q=..."
        });
    }

    try {
      const result =
        await resolveSeries({
          query,
          groupKey:
            groupKey ||
            null
        });

      return res.json(
        result
      );
    } catch (error) {
      if (
        error.code ===
        "SEARCH_GROUP_REQUIRED"
      ) {
        return res
          .status(409)
          .json({
            error:
              error.code,

            message:
              "More than one work matched. Supply group_key.",

            groups:
              error.groups ||
              []
          });
      }

      if (
        error.code ===
        "SEARCH_GROUP_NOT_FOUND"
      ) {
        return res
          .status(404)
          .json({
            error:
              error.code,

            groups:
              error.groups ||
              []
          });
      }

      console.error(
        "Series resolve error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "SERIES_RESOLVE_FAILED",

          message:
            error.message
        });
    }
  }
);

module.exports =
  router;
