const express = require("express");
const {
  executePlayback
} = require("../services/playback-executor");

const router = express.Router();

router.get("/execute", async (req, res) => {
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
      await executePlayback({
        query,
        groupKey:
          req.query.group_key ||
          null,
        season:
          req.query.season || 1,
        episode:
          req.query.episode,
        region:
          req.query.region || null
      });

    return res.status(
      result.status === "ready"
        ? 200
        : 503
    ).json(result);
  } catch (error) {
    return res.status(500).json({
      error:
        "PLAYBACK_EXECUTION_FAILED",
      message:
        error.message
    });
  }
});

module.exports = router;
