const axios = require("axios");
const {
  classifyFailure
} = require("./failure-classifier");

function targetUrl(candidate) {
  if (
    candidate.type === "embed" ||
    candidate.type === "external_player"
  ) {
    return (
      candidate.embed_url ||
      candidate.client_url ||
      candidate.url ||
      null
    );
  }

  return (
    candidate.direct_url ||
    candidate.client_url ||
    null
  );
}

async function validateCandidate(
  candidate,
  options = {}
) {
  const request =
    options.request || axios;

  const timeoutMs =
    Number(
      options.timeoutMs || 8000
    );

  const url =
    targetUrl(candidate);

  const started =
    Date.now();

  if (!url) {
    return {
      status: "failed",
      reason:
        candidate.type === "embed"
          ? "EMBED_UNAVAILABLE"
          : "INVALID_MEDIA",
      latency_ms: 0,
      validation_scope: "none"
    };
  }

  try {
    const isEmbed =
      candidate.type === "embed" ||
      candidate.type ===
        "external_player";

    const response =
      await request.get(url, {
        timeout: timeoutMs,
        maxRedirects: 5,
        responseType:
          isEmbed
            ? "text"
            : "arraybuffer",
        headers:
          isEmbed
            ? {
                "User-Agent":
                  "Mozilla/5.0 TheebHealth/1.0",
                Accept:
                  "text/html,application/xhtml+xml"
              }
            : {
                "User-Agent":
                  "Mozilla/5.0 TheebHealth/1.0",
                Accept: "*/*",
                Range: "bytes=0-2047",
                "Accept-Encoding":
                  "identity"
              },
        maxContentLength:
          isEmbed
            ? 512 * 1024
            : 64 * 1024,
        validateStatus(status) {
          return (
            status >= 200 &&
            status < 400
          );
        }
      });

    const contentType =
      String(
        response.headers?.[
          "content-type"
        ] || ""
      ).toLowerCase();

    if (
      !isEmbed &&
      !(
        contentType.includes("video") ||
        contentType.includes(
          "octet-stream"
        ) ||
        candidate.type === "hls"
      )
    ) {
      const error =
        new Error(
          "INVALID_MEDIA content-type"
        );

      error.status =
        response.status;

      throw error;
    }

    return {
      status: "healthy",
      http_status:
        response.status,
      latency_ms:
        Date.now() - started,
      content_type:
        contentType || null,
      validation_scope:
        isEmbed
          ? "embed_page_reachable"
          : "media_bytes_verified"
    };
  } catch (error) {
    return {
      status: "failed",
      reason:
        classifyFailure(
          error,
          candidate
        ),
      http_status:
        error.response?.status ||
        error.status ||
        null,
      latency_ms:
        Date.now() - started,
      validation_scope:
        candidate.type === "embed"
          ? "embed_page_reachable"
          : "media_bytes_verified"
    };
  }
}

module.exports = {
  targetUrl,
  validateCandidate
};
