const express = require("express");
const axios = require("axios");
const providers = require("../providers");

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

    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    upstream = await axios.get(source.direct_url, {
      responseType: "stream",
      headers,
      timeout: 30000,
      maxRedirects: 5,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      decompress: false,
      validateStatus: status =>
        status === 200 || status === 206
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
      console.error("Theeb stream error:", err.message);

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

    console.error(
      "Theeb Play error:",
      error.message,
      status || ""
    );

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
