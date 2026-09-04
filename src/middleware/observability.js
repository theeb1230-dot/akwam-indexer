const { randomUUID } = require("node:crypto");
const logger = require("../observability/logger");
const metrics = require("../observability/metrics");

function routeName(req) {
  const route = req.route?.path;
  if (!route) return "unmatched";
  return `${req.baseUrl || ""}${route}`
    .replace(/[^a-zA-Z0-9_.:/*\/-]/g, "_")
    .slice(0, 96);
}

function observability(req, res, next) {
  const incoming = String(req.get("x-request-id") || "");
  const requestId = /^[a-zA-Z0-9_.:-]{8,128}$/.test(incoming) ? incoming : randomUUID();
  const started = process.hrtime.bigint();
  req.requestId = requestId;
  res.set("x-request-id", requestId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const route = routeName(req);
    metrics.increment("theeb_http_requests_total", {
      method: req.method,
      status: String(res.statusCode),
      route
    });
    metrics.observe("theeb_http_request_duration_ms", {
      method: req.method,
      route
    }, durationMs);
    logger.info("http_request_completed", {
      request_id: requestId,
      method: req.method,
      route,
      status_code: res.statusCode,
      duration_ms: Math.round(durationMs)
    });
  });
  next();
}

module.exports = observability;
module.exports.routeName = routeName;
