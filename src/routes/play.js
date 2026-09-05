const express = require("express");
const providers = require("../providers");
const { safeGet } = require("../services/safe-media-request");
const { opaqueIdentifier } = require("../middleware/security");
const logger = require("../observability/logger");

const router = express.Router();

function clean(value) {
  return String(value || "").trim().toLowerCase();
}

function pickSource(sources, quality) {
  if (!Array.isArray(sources)) return null;

  const wanted = clean(quality);

  if (wanted) {
    const exact = sources.find(
      s => s && s.direct_url && clean(s.quality) === wanted
    );
    if (exact) return exact;
  }

  return sources.find(s => s && s.direct_url) || null;
}

router.get("/play/:provider/:watchId/:episodeId", async (req, res) => {
  let upstream = null;

  try {
    const providerName = clean(req.params.provider);

    if (
      !opaqueIdentifier(providerName, 50) ||
      !opaqueIdentifier(req.params.watchId) ||
      !opaqueIdentifier(req.params.episodeId)
    ) {
      return res.status(400).json({ error: "INVALID_PATH" });
    }

    if (!providers.has(providerName)) {
      return res.status(404).json({
        error: "UNKNOWN_PROVIDER",
        provider: providerName
      });
    }

    const provider = providers.get(providerName);

    if (!provider || typeof provider.getWatchInfo !== "function") {
      return res.status(501).json({
        error: "WATCH_NOT_SUPPORTED"
      });
    }

    const info = await provider.getWatchInfo(
      req.params.watchId,
      req.params.episodeId
    );

    const source = pickSource(
      info.sources,
      req.query.quality
    );

    if (!source) {
      return res.status(404).json({
        error: "DIRECT_SOURCE_NOT_FOUND",
        available_qualities: info.available_qualities || []
      });
    }

    const headers = {
      "User-Agent": "curl/8.5.0",
      "Accept": "*/*",
      "Accept-Encoding": "identity"
    };

    if (req.headers.range && !/^bytes=\d*-\d*$/.test(req.headers.range)) {
      return res.status(416).json({ error: "INVALID_RANGE" });
    }

    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    upstream = await safeGet(source.direct_url, {
      responseType: "stream",
      headers,
      timeout: 30000,
      decompress: false,
      validateStatus: status => status === 200 || status === 206 || (status >= 300 && status < 400)
    }, {
      maxRedirects: 5,
      // Playback is streamed and never buffered by the API. Redirects and
      // every resolved address are still validated by safeGet.
      maxResponseBytes: null
    });

    res.status(upstream.status);

    res.setHeader(
      "Content-Type",
      source.type || "video/mp4"
    );

    res.setHeader(
      "Content-Disposition",
      'inline; filename="theeb-video.mp4"'
    );

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Theeb-Provider", providerName);
    res.setHeader(
      "X-Theeb-Quality",
      source.quality || "unknown"
    );

    const passHeaders = [
      "content-length",
      "content-range",
      "etag",
      "last-modified"
    ];

    for (const name of passHeaders) {
      const value = upstream.headers[name];
      if (value !== undefined) {
        res.setHeader(name, value);
      }
    }

    upstream.data.on("error", err => {
      logger.error("play_stream_failed", {
        request_id: req.requestId,
        error_code: err.code || "STREAM_FAILED"
      });

      if (!res.destroyed) {
        res.destroy(err);
      }
    });

    res.on("close", () => {
      if (
        upstream &&
        upstream.data &&
        typeof upstream.data.destroy === "function"
      ) {
        upstream.data.destroy();
      }
    });

    upstream.data.pipe(res);
  } catch (error) {
    const status = error.response?.status || null;

    logger.error("play_request_failed", {
      request_id: req.requestId,
      error_code: error.code || "THEEB_PLAY_FAILED",
      upstream_status: status
    });

    if (res.headersSent) {
      return res.end();
    }

    return res.status(502).json({
      error: "THEEB_PLAY_FAILED",
      message: error.message,
      upstream_status: status
    });
  }
});

module.exports = router;
