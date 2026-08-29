const FAILURE = Object.freeze({
  TIMEOUT: "TIMEOUT",
  HTTP_403: "HTTP_403",
  HTTP_404: "HTTP_404",
  GEO_BLOCKED: "GEO_BLOCKED",
  SERVER_DOWN: "SERVER_DOWN",
  SOURCE_EXPIRED: "SOURCE_EXPIRED",
  INVALID_MEDIA: "INVALID_MEDIA",
  EMBED_UNAVAILABLE: "EMBED_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  PROVIDER_ERROR: "PROVIDER_ERROR"
});

function classifyFailure(error, candidate = {}) {
  const status = Number(
    error?.response?.status ||
    error?.status ||
    0
  );

  const message = String(
    error?.message || ""
  ).toLowerCase();

  const body = String(
    error?.response?.data || ""
  ).toLowerCase();

  if (
    error?.code === "ECONNABORTED" ||
    error?.code === "ETIMEDOUT" ||
    message.includes("timeout")
  ) {
    return FAILURE.TIMEOUT;
  }

  if (
    status === 403 &&
    (
      body.includes("country") ||
      body.includes("region") ||
      body.includes("geo")
    )
  ) {
    return FAILURE.GEO_BLOCKED;
  }

  if (status === 403) {
    return FAILURE.HTTP_403;
  }

  if (status === 404) {
    return FAILURE.HTTP_404;
  }

  if (status === 429) {
    return FAILURE.RATE_LIMITED;
  }

  if (
    status === 410 ||
    body.includes("expired")
  ) {
    return FAILURE.SOURCE_EXPIRED;
  }

  if (status >= 500) {
    return FAILURE.SERVER_DOWN;
  }

  if (
    candidate.type === "embed" &&
    (
      status >= 400 ||
      message.includes("embed")
    )
  ) {
    return FAILURE.EMBED_UNAVAILABLE;
  }

  if (
    message.includes("media") ||
    message.includes("content-type")
  ) {
    return FAILURE.INVALID_MEDIA;
  }

  return FAILURE.PROVIDER_ERROR;
}

function retryPolicy(reason) {
  switch (reason) {
    case FAILURE.TIMEOUT:
    case FAILURE.SOURCE_EXPIRED:
      return {
        retries: 1,
        fallback: true
      };

    case FAILURE.HTTP_403:
    case FAILURE.HTTP_404:
    case FAILURE.GEO_BLOCKED:
    case FAILURE.RATE_LIMITED:
    case FAILURE.SERVER_DOWN:
    case FAILURE.INVALID_MEDIA:
    case FAILURE.EMBED_UNAVAILABLE:
      return {
        retries: 0,
        fallback: true
      };

    default:
      return {
        retries: 0,
        fallback: true
      };
  }
}

module.exports = {
  FAILURE,
  classifyFailure,
  retryPolicy
};
