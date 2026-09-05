const test = require("node:test");
const assert = require("node:assert/strict");

const { httpServerConfig } = require("../src/config/http-server");

test("HTTP server timeouts use bounded production-safe defaults", () => {
  const config = httpServerConfig({});
  assert.deepEqual(config, {
    requestTimeoutMs: 30000,
    headersTimeoutMs: 10000,
    keepAliveTimeoutMs: 5000,
    maxRequestsPerSocket: 1000
  });
});

test("HTTP server timeout overrides are bounded and ordered", () => {
  assert.equal(
    httpServerConfig({ HTTP_REQUEST_TIMEOUT_MS: "45000" }).requestTimeoutMs,
    45000
  );
  assert.throws(
    () => httpServerConfig({ HTTP_HEADERS_TIMEOUT_MS: "30000" }),
    error => error.code === "INVALID_HTTP_TIMEOUT_ORDER"
  );
  assert.throws(
    () => httpServerConfig({ HTTP_KEEP_ALIVE_TIMEOUT_MS: "500" }),
    error => error.code === "INVALID_HTTP_KEEP_ALIVE_TIMEOUT_MS"
  );
  assert.throws(
    () => httpServerConfig({ HTTP_MAX_REQUESTS_PER_SOCKET: "10001" }),
    error => error.code === "INVALID_HTTP_MAX_REQUESTS_PER_SOCKET"
  );
});
