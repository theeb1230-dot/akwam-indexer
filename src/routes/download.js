const express = require("express");
const {
  createDownloadResolver
} = require("../services/download-resolver");

function clientDownloadResult(result) {
  return {
    ...result,
    download_options: result.download_options.map(option => {
      const {
        candidate_id: candidateId,
        provider,
        provider_episode_id: providerEpisodeId,
        locator,
        live_url: liveUrl,
        ...clientOption
      } = option;
      void provider;
      void providerEpisodeId;
      void locator;
      void liveUrl;
      const {
        availability,
        ...fields
      } = clientOption;
      return {
        id: candidateId,
        ...fields,
        status: availability
      };
    }),
    source_errors: result.source_errors.map(item => ({
      error: item.error
    }))
  };
}

function downloadErrorResponse(error) {
  const knownErrors = {
    INVALID_CANONICAL_EPISODE_ID: {
      status: 400,
      message: "Canonical episode ID must be a positive integer"
    },
    CANONICAL_EPISODE_NOT_FOUND: {
      status: 404,
      message: "Canonical episode was not found"
    }
  };
  const safe = knownErrors[error?.code] || {
    status: 500,
    message: "Download options could not be resolved"
  };

  return {
    status: safe.status,
    body: {
      error: knownErrors[error?.code]
        ? error.code
        : "DOWNLOAD_RESOLUTION_FAILED",
      message: safe.message
    }
  };
}

function createDownloadRouter(options = {}) {
  const router = express.Router();
  const resolver = options.resolver || createDownloadResolver();

  router.get("/episodes/:id/download-options/:candidateId/open", async (req, res) => {
    try {
      const result = await resolver.resolveDownloadOptions(req.params.id);
      const candidateId = String(req.params.candidateId || "").trim();
      const option = result.download_options.find(item =>
        String(item.candidate_id) === candidateId
      );

      if (!option) {
        return res.status(404).json({ error: "DOWNLOAD_OPTION_NOT_FOUND" });
      }

      const target = new URL(String(option.live_url || ""));
      if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) {
        return res.status(502).json({ error: "DOWNLOAD_OPTION_UNSAFE" });
      }

      res.setHeader("Cache-Control", "no-store");
      return res.redirect(307, target.href);
    } catch (error) {
      const response = downloadErrorResponse(error);
      return res.status(response.status).json(response.body);
    }
  });

  router.get("/episodes/:id/download-options", async (req, res) => {
    try {
      const result = await resolver.resolveDownloadOptions(req.params.id);
      return res.json(clientDownloadResult(result));
    } catch (error) {
      const response = downloadErrorResponse(error);
      return res.status(response.status).json(response.body);
    }
  });

  return router;
}

module.exports = createDownloadRouter();
module.exports.createDownloadRouter = createDownloadRouter;
module.exports.clientDownloadResult = clientDownloadResult;
module.exports.downloadErrorResponse = downloadErrorResponse;
