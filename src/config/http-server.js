function boundedInteger(value, fallback, minimum, maximum, code) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  return parsed;
}

function httpServerConfig(env = process.env) {
  const requestTimeoutMs = boundedInteger(
    env.HTTP_REQUEST_TIMEOUT_MS, 30000, 5000, 120000, "INVALID_HTTP_REQUEST_TIMEOUT_MS"
  );
  const headersTimeoutMs = boundedInteger(
    env.HTTP_HEADERS_TIMEOUT_MS, 10000, 2000, 60000, "INVALID_HTTP_HEADERS_TIMEOUT_MS"
  );
  const keepAliveTimeoutMs = boundedInteger(
    env.HTTP_KEEP_ALIVE_TIMEOUT_MS, 5000, 1000, 30000, "INVALID_HTTP_KEEP_ALIVE_TIMEOUT_MS"
  );
  const maxRequestsPerSocket = boundedInteger(
    env.HTTP_MAX_REQUESTS_PER_SOCKET, 1000, 1, 10000, "INVALID_HTTP_MAX_REQUESTS_PER_SOCKET"
  );

  if (headersTimeoutMs >= requestTimeoutMs) {
    const error = new Error("INVALID_HTTP_TIMEOUT_ORDER");
    error.code = "INVALID_HTTP_TIMEOUT_ORDER";
    throw error;
  }

  return Object.freeze({
    requestTimeoutMs,
    headersTimeoutMs,
    keepAliveTimeoutMs,
    maxRequestsPerSocket
  });
}

module.exports = { httpServerConfig };
