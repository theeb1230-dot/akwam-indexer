const express = require("express");
const logger = require("../observability/logger");

const {
  searchAll
} = require("../services/search-orchestrator");

const router =
  express.Router();

/*
 * =========================================================
 * LIVE MULTI-PROVIDER SEARCH
 *
 * GET /api/search?q=...
 * =========================================================
 */

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
          "Use /api/search?q=..."
      });
    }

    try {
      const result =
        await searchAll(
          query
        );

      return res.json({
        query:
          result.query,

        normalized_query:
          result.normalized_query,

        searched_providers:
          result.searched_providers,

        successful_providers:
          result.successful_providers,

        failed_providers:
          result.failed_providers,

        result_count:
          result.count,

        group_count:
          result.group_count,

        groups:
          result.groups,

        /*
         * نخلي التشخيص متاحًا فقط عند الطلب
         * حتى لا يكبر الرد العادي.
         *
         * /api/search?q=Lucky&debug=1
         */
        ...(String(
          req.query.debug ||
          ""
        ) === "1"
          ? {
              provider_results:
                result.provider_results
            }
          : {})
      });
    } catch (error) {
      logger.error("live_search_failed", {
        request_id: req.requestId,
        error_code: error.code || "LIVE_SEARCH_FAILED"
      });

      return res.status(500).json({
        error:
          "LIVE_SEARCH_FAILED",

        message:
          error.message
      });
    }
  }
);

module.exports =
  router;
