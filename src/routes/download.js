const express = require("express");
const {
  createDownloadResolver
} = require("../services/download-resolver");

const router = express.Router();
const resolver = createDownloadResolver();

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

router.get("/episodes/:id/download-options", async (req, res) => {
  try {
    const result = await resolver.resolveDownloadOptions(req.params.id);
    return res.json(clientDownloadResult(result));
  } catch (error) {
    const response = downloadErrorResponse(error);
    return res.status(response.status).json(response.body);
  }
});

module.exports = router;
module.exports.clientDownloadResult = clientDownloadResult;
module.exports.downloadErrorResponse = downloadErrorResponse;
