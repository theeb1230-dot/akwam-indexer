const express =
  require("express");
const logger = require("../observability/logger");

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
            "اكتب عبارة بحث للمتابعة."
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
              "وجدنا أكثر من نتيجة مطابقة. اختر المحتوى المطلوب.",

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

            message:
              "لم نجد المحتوى المطلوب.",

            groups:
              error.groups ||
              []
          });
      }

      logger.error("series_resolve_failed", {
        request_id: req.requestId,
        error_code: error.code || "SERIES_RESOLVE_FAILED"
      });

      return res
        .status(500)
        .json({
          error:
            "SERIES_RESOLVE_FAILED",

          message:
            "تعذر تحميل تفاصيل المحتوى الآن. حاول مرة أخرى."
        });
    }
  }
);

module.exports =
  router;
