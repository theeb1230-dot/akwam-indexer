const crypto = require("node:crypto");
const { tokensEqual } = require("../config/security");
const logger = require("../observability/logger");

const ERROR_SCHEMA_VERSION = "1.0";
const ERROR_MESSAGES = Object.freeze({
  CORS_ORIGIN_DENIED: "The request origin is not allowed.",
  DIRECT_SOURCE_NOT_FOUND: "No direct source is currently available.",
  IMPORT_ALREADY_RUNNING: "An import for this series is already running.",
  INTERNAL_ERROR: "An internal error occurred.",
  INVALID_INPUT: "Request input is malformed or too large.",
  INVALID_PATH: "Request path encoding or identifier is invalid.",
  INVALID_PROVIDER_TARGET: "The provider target is not allowed.",
  INVALID_QUERY: "The search query is invalid.",
  INVALID_RANGE: "The requested byte range is invalid.",
  JOB_NOT_CANCELLABLE: "The job cannot be cancelled in its current state.",
  JOB_NOT_FOUND: "The requested job was not found.",
  NOT_FOUND: "The requested endpoint was not found.",
  PROVIDER_EPISODE_FAILED: "The provider episode request failed.",
  PROVIDER_REQUIRED: "A provider is required.",
  PROVIDER_SERIES_FAILED: "The provider series request failed.",
  PROVIDER_WATCH_FAILED: "The provider watch request failed.",
  RATE_LIMITED: "Too many requests.",
  REQUEST_BODY_TOO_LARGE: "Request body exceeds the configured limit.",
  SERIES_ID_REQUIRED: "A series identifier is required.",
  THEEB_PLAY_FAILED: "Playback source resolution failed.",
  UNAUTHORIZED: "A valid Bearer token is required.",
  UNKNOWN_PROVIDER: "The requested provider is not registered.",
  URI_TOO_LONG: "Request URI is too long or contains control characters.",
  WATCH_NOT_SUPPORTED: "This provider does not support playback."
});

const SAFE_DETAIL_KEYS = new Set([
  "available_providers", "available_qualities", "job_id", "method",
  "path", "progress_url", "provider", "status", "upstream_status"
]);

function requestContext(req, res, next) {
  const incoming = String(req.headers["x-request-id"] || "");
  req.requestId = /^[A-Za-z0-9._:-]{1,100}$/.test(incoming)
    ? incoming
    : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  if (process.env.NODE_ENV === "production" && req.secure) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  next();
}

function errorEnvelope(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = body => {
    if (!body || typeof body.error !== "string") return originalJson(body);
    const { error: code, ...candidateDetails } = body;
    const details = Object.fromEntries(
      Object.entries(candidateDetails)
        .filter(([key]) => SAFE_DETAIL_KEYS.has(key))
    );
    return originalJson({
      error: {
        schema_version: ERROR_SCHEMA_VERSION,
        code,
        message: ERROR_MESSAGES[code] || "The request could not be completed.",
        ...(Object.keys(details).length ? { details } : {})
      },
      request_id: req.requestId
    });
  };
  next();
}

function appendVary(res, value) {
  const current = String(res.getHeader?.("Vary") || "");
  const values = current.split(",").map(item => item.trim()).filter(Boolean);
  if (!values.includes(value)) values.push(value);
  res.setHeader("Vary", values.join(", "));
}

function corsPolicy(config) {
  const allowed = new Set(config.corsOrigins || []);
  return (req, res, next) => {
    const rawOrigin = String(req.headers?.origin || "");
    if (!rawOrigin) return next();

    let origin;
    try {
      origin = new URL(rawOrigin).origin;
    } catch {
      return res.status(403).json({ error: "CORS_ORIGIN_DENIED" });
    }

    const host = String(req.get?.("host") || req.headers?.host || "");
    const protocol = String(req.protocol || "http");
    const sameOrigin = host && origin === protocol + "://" + host;

    if (!sameOrigin && !allowed.has(origin)) {
      return res.status(403).json({ error: "CORS_ORIGIN_DENIED" });
    }

    appendVary(res, "Origin");
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Request-Id"
    );
    res.setHeader("Access-Control-Max-Age", "600");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }
    next();
  };
}

function bearerToken(header) {
  const match = /^Bearer ([^\s]+)$/i.exec(String(header || ""));
  return match?.[1] || "";
}

function authentication(config) {
  return (req, res, next) => {
    if (invalidText(req.originalUrl, 2_048)) {
      return res.status(414).json({ error: "URI_TOO_LONG", message: "Request URI is too long or contains control characters." });
    }
    if (!config.authRequired || req.method === "OPTIONS" || req.path === "/") return next();
    const token = bearerToken(req.headers.authorization);
    if (!tokensEqual(token, config.apiToken)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      return res.status(401).json({ error: "UNAUTHORIZED", message: "A valid Bearer token is required." });
    }
    next();
  };
}

function rateLimiter(config, now = () => Date.now(), options = {}) {
  const clients = new Map();
  const scope = String(options.scope || "api");
  const maximum = Number(options.maximum || config.rateLimitMax);
  const maxClients = Number(options.maxClients || 10_000);
  return (req, res, next) => {
    const timestamp = now();
    const address = req.ip || req.socket?.remoteAddress || "unknown";
    // Never use X-Forwarded-For directly. Express only populates req.ip from
    // it when the deployment explicitly configured a trusted proxy hop count.
    const key = `${scope}:${address}`;
    let entry = clients.get(key);
    if (!entry || entry.resetAt <= timestamp) {
      entry = { count: 0, resetAt: timestamp + config.rateLimitWindowMs };
      clients.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(0, maximum - entry.count);
    res.setHeader("RateLimit-Limit", maximum);
    res.setHeader("RateLimit-Remaining", remaining);
    res.setHeader("RateLimit-Reset", Math.ceil(entry.resetAt / 1000));
    if (entry.count > maximum) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000)));
      return res.status(429).json({ error: "RATE_LIMITED", message: "Too many requests." });
    }
    if (clients.size > maxClients) {
      for (const [client, value] of clients) if (value.resetAt <= timestamp) clients.delete(client);
      while (clients.size > maxClients) clients.delete(clients.keys().next().value);
    }
    next();
  };
}

function invalidText(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
}

function opaqueIdentifier(value, maxLength = 200) {
  const text = String(value ?? "");
  return text.length > 0 && text.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(text);
}

function providerHosts(provider) {
  const values = [provider?.baseUrl, ...(provider?.allowedHosts || [])];
  const hosts = new Set();
  for (const value of values) {
    if (!value) continue;
    try {
      const parsed = String(value).includes("://")
        ? new URL(value)
        : new URL(`https://${value}`);
      hosts.add(parsed.hostname.toLowerCase());
    } catch {
      // Invalid provider-owned configuration is never made caller-accessible.
    }
  }
  return hosts;
}

function validProviderTarget(provider, value) {
  const text = String(value ?? "").trim();
  if (!text || invalidText(text, 500)) return false;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return true;

  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
    return providerHosts(provider).has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function inputGuard(config) {
  const forbidden = new Set(["__proto__", "prototype", "constructor"]);
  function inspect(value, depth = 0) {
    if (depth > 8) return false;
    if (typeof value === "string") return !invalidText(value, config.maxIdentifierLength);
    if (!value || typeof value !== "object") return true;
    return Object.keys(value).every(key => (
      !forbidden.has(key) &&
      !invalidText(key, config.maxIdentifierLength) &&
      inspect(value[key], depth + 1)
    ));
  }
  return (req, res, next) => {
    let pathSegments;
    try {
      pathSegments = String(req.path || "")
        .split("/")
        .filter(Boolean)
        .map(segment => decodeURIComponent(segment));
    } catch {
      return res.status(400).json({ error: "INVALID_PATH", message: "Request path encoding is invalid." });
    }
    if (pathSegments.some(segment => invalidText(segment, config.maxIdentifierLength))) {
      return res.status(400).json({ error: "INVALID_PATH", message: "A path identifier is malformed or too large." });
    }
    if (!inspect(req.params) || !inspect(req.query) || !inspect(req.body)) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "Request input is malformed or too large." });
    }
    const query = req.query?.q ?? req.query?.query;
    if (query !== undefined && invalidText(query, config.maxQueryLength)) {
      return res.status(400).json({ error: "INVALID_QUERY", message: `Search query must be at most ${config.maxQueryLength} characters.` });
    }
    next();
  };
}

function safeLogValue(value, fallback) {
  const text = String(value || "");
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(text) ? text : fallback;
}

function errorHandler(error, req, res, _next) {
  if (res.headersSent) return res.end();
  const bodyError = error?.type === "entity.too.large";
  const status = bodyError ? 413 : 500;
  if (!bodyError) {
    logger.error("http_request_failed", {
      request_id: safeLogValue(req.requestId, "unknown"),
      error_code: safeLogValue(error?.code, "UNEXPECTED_ERROR"),
      error_name: safeLogValue(error?.name, "Error")
    });
  }
  return res.status(status).json({
    error: bodyError ? "REQUEST_BODY_TOO_LARGE" : "INTERNAL_ERROR",
    message: bodyError ? "Request body exceeds the configured limit." : "An internal error occurred."
  });
}

module.exports = {
  authentication,
  corsPolicy,
  bearerToken,
  errorEnvelope,
  errorHandler,
  inputGuard,
  invalidText,
  opaqueIdentifier,
  providerHosts,
  rateLimiter,
  requestContext,
  validProviderTarget
};
