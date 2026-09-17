const express = require("express");
const logger = require("../observability/logger");

const {
  searchAll,
  groupResults
} = require("../services/search-orchestrator");
const { rankWithProviderHealth } = require("../services/search-health-ranking");
const { createObservabilityRepository } = require("../repositories/observability-repository");

const router =
  express.Router();

function observabilityRepository() {
  try {
    return createObservabilityRepository();
  } catch (_) {
    return null;
  }
}

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
          "اكتب عبارة بحث للمتابعة."
      });
    }

    try {
      const result =
        await searchAll(
          query
        );

      // Semantic relevance remains authoritative. Playback-derived provider
      // health is advisory and only breaks equal match-score ties. Missing or
      // unavailable observability data is deliberately neutral so search
      // remains available.
      const rankedResults =
        await rankWithProviderHealth(
          result.results,
          observabilityRepository()
        );

      const rankedGroups =
        groupResults(
          rankedResults,
          result.query
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
          rankedResults.length,

        group_count:
          rankedGroups.length,

        groups:
          rankedGroups,

        ...(String(
          req.query.debug ||
          ""
        ) === "1"
          ? {
              provider_results:
                result.provider_results,
              ranked_results:
                rankedResults
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
          "تعذر إكمال البحث الآن. حاول مرة أخرى."
      });
    }
  }
);

module.exports =
  router;
