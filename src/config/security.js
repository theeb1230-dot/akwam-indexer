const crypto = require("node:crypto");

function booleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error("INVALID_BOOLEAN_ENVIRONMENT_VALUE");
}

function positiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`INVALID_${name}`);
  }
  return parsed;
}

function boundedInteger(value, fallback, name, maximum) {
  const parsed = positiveInteger(value, fallback, name);
  if (parsed > maximum) throw new Error(`INVALID_${name}`);
  return parsed;
}

function requestBodyLimit(value = "256kb") {
  const match = /^(\d+)(b|kb|mb)$/i.exec(String(value).trim());
  if (!match) throw new Error("INVALID_REQUEST_BODY_LIMIT");
  const multiplier = { b: 1, kb: 1024, mb: 1024 * 1024 }[match[2].toLowerCase()];
  const bytes = Number(match[1]) * multiplier;
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 1024 * 1024) {
    throw new Error("INVALID_REQUEST_BODY_LIMIT");
  }
  return String(value).trim().toLowerCase();
}

function securityConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const authRequired = booleanEnv(env.THEEB_AUTH_REQUIRED, production);
  const apiToken = String(env.THEEB_API_TOKEN || "");
  const trustProxyHops = env.THEEB_TRUST_PROXY_HOPS === undefined
    ? 0
    : positiveInteger(env.THEEB_TRUST_PROXY_HOPS, 0, "THEEB_TRUST_PROXY_HOPS");

  if (authRequired && apiToken.length < 32) {
    throw new Error("THEEB_API_TOKEN_MUST_BE_AT_LEAST_32_CHARACTERS");
  }
  if (production && !authRequired) {
    throw new Error("THEEB_PRODUCTION_AUTH_CANNOT_BE_DISABLED");
  }

  return {
    production,
    authRequired,
    apiToken,
    // A numeric hop count is deliberately used instead of `true`. Express'
    // boolean trust-proxy mode trusts the entire forwarded chain and lets a
    // caller forge the address used by the rate limiter when the deployment
    // has fewer proxies than expected.
    trustProxy: trustProxyHops === 0 ? false : trustProxyHops,
    rateLimitWindowMs: boundedInteger(env.RATE_LIMIT_WINDOW_MS, 60_000, "RATE_LIMIT_WINDOW_MS", 3_600_000),
    rateLimitMax: boundedInteger(env.RATE_LIMIT_MAX, 120, "RATE_LIMIT_MAX", 10_000),
    telemetryRateLimitMax: boundedInteger(
      env.TELEMETRY_RATE_LIMIT_MAX,
      60,
      "TELEMETRY_RATE_LIMIT_MAX",
      10_000
    ),
    bodyLimit: requestBodyLimit(env.REQUEST_BODY_LIMIT),
    maxQueryLength: boundedInteger(env.MAX_QUERY_LENGTH, 200, "MAX_QUERY_LENGTH", 2_000),
    maxIdentifierLength: boundedInteger(env.MAX_IDENTIFIER_LENGTH, 500, "MAX_IDENTIFIER_LENGTH", 4_096)
  };
}

function tokensEqual(actual, expected) {
  const left = Buffer.from(String(actual || ""));
  const right = Buffer.from(String(expected || ""));
  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, right);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

module.exports = { requestBodyLimit, securityConfig, tokensEqual };
