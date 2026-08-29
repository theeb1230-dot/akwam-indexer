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

async function verifyMediaBytes(data) {
  if (
    Buffer.isBuffer(data) ||
    data instanceof Uint8Array
  ) {
    if (data.length === 0) {
      throw new Error(
        "INVALID_MEDIA empty response"
      );
    }

    return data.length;
  }

  if (
    !data ||
    typeof data.on !== "function"
  ) {
    throw new Error(
      "INVALID_MEDIA missing response body"
    );
  }

  return new Promise(
    (resolve, reject) => {
      let settled = false;

      const finish = value => {
        if (settled) {
          return;
        }

        settled = true;
        data.destroy?.();
        resolve(value);
      };

      data.once("data", chunk => {
        const size =
          Buffer.byteLength(chunk);

        if (size > 0) {
          finish(size);
        }
      });

      data.once("end", () => {
        if (!settled) {
          reject(
            new Error(
              "INVALID_MEDIA empty response"
            )
          );
        }
      });

      data.once("error", error => {
        if (!settled) {
          reject(error);
        }
      });
    }
  );
}

function diagnostic(error) {
  return String(
    error?.message || "Unknown error"
  )
    .replace(/https?:\/\/\S+/gi, "[url]")
    .slice(0, 180);
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
      detail: "Candidate has no target URL",
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
            : "stream",
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
            : Infinity,
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
          `INVALID_MEDIA content-type: ${
            contentType || "missing"
          }`
        );

      error.status =
        response.status;

      throw error;
    }

    const sampledBytes =
      isEmbed
        ? null
        : await verifyMediaBytes(
            response.data
          );

    return {
      status: "healthy",
      http_status:
        response.status,
      latency_ms:
        Date.now() - started,
      content_type:
        contentType || null,
      sampled_bytes:
        sampledBytes,
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
      detail:
        diagnostic(error),
      http_status:
        error.response?.status ||
        error.status ||
        null,
      content_type:
        error.response?.headers?.[
          "content-type"
        ] || null,
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
  verifyMediaBytes,
  validateCandidate
};
