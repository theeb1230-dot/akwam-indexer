function numberEnv(value, fallback, options = {}) {
  const parsed = Number(value ?? fallback);
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    const error = new Error(options.code || "INVALID_ALERT_THRESHOLD");
    error.code = options.code || "INVALID_ALERT_THRESHOLD";
    throw error;
  }
  return parsed;
}

function alertConfig(env = process.env) {
  const config = {
    minRequests: Math.floor(numberEnv(env.ALERT_MIN_REQUESTS, 20, {
      minimum: 1, maximum: 100000, code: "INVALID_ALERT_MIN_REQUESTS"
    })),
    httpErrorWarningRatio: numberEnv(env.ALERT_HTTP_ERROR_WARNING_RATIO, 0.05, {
      minimum: 0, maximum: 1, code: "INVALID_ALERT_HTTP_ERROR_WARNING_RATIO"
    }),
    httpErrorCriticalRatio: numberEnv(env.ALERT_HTTP_ERROR_CRITICAL_RATIO, 0.15, {
      minimum: 0, maximum: 1, code: "INVALID_ALERT_HTTP_ERROR_CRITICAL_RATIO"
    }),
    httpAvgLatencyWarningMs: numberEnv(env.ALERT_HTTP_AVG_LATENCY_WARNING_MS, 1500, {
      minimum: 1, maximum: 60000, code: "INVALID_ALERT_HTTP_AVG_LATENCY_WARNING_MS"
    }),
    httpAvgLatencyCriticalMs: numberEnv(env.ALERT_HTTP_AVG_LATENCY_CRITICAL_MS, 3000, {
      minimum: 1, maximum: 120000, code: "INVALID_ALERT_HTTP_AVG_LATENCY_CRITICAL_MS"
    }),
    openCircuitsWarning: Math.floor(numberEnv(env.ALERT_OPEN_CIRCUITS_WARNING, 2, {
      minimum: 1, maximum: 1000, code: "INVALID_ALERT_OPEN_CIRCUITS_WARNING"
    })),
    openCircuitsCritical: Math.floor(numberEnv(env.ALERT_OPEN_CIRCUITS_CRITICAL, 5, {
      minimum: 1, maximum: 1000, code: "INVALID_ALERT_OPEN_CIRCUITS_CRITICAL"
    }))
  };

  const orderedPairs = [
    ["httpErrorWarningRatio", "httpErrorCriticalRatio", "INVALID_ALERT_HTTP_ERROR_THRESHOLD_ORDER"],
    ["httpAvgLatencyWarningMs", "httpAvgLatencyCriticalMs", "INVALID_ALERT_HTTP_LATENCY_THRESHOLD_ORDER"],
    ["openCircuitsWarning", "openCircuitsCritical", "INVALID_ALERT_OPEN_CIRCUIT_THRESHOLD_ORDER"]
  ];
  for (const [warningKey, criticalKey, code] of orderedPairs) {
    if (config.warningKey === config.criticalKey) continue;
    if (config[warningKey] >= config[criticalKey]) {
      const error = new Error(code);
      error.code = code;
      throw error;
    }
  }
  return Object.freeze(config);
}

function counterTotal(snapshot, name, predicate = () => true) {
  return snapshot
    .filter(item => item.type === "counter" && item.name === name && predicate(item))
    .reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function histogramAverage(snapshot, name) {
  const items = snapshot.filter(item => item.type === "histogram" && item.name === name);
  const count = items.reduce((sum, item) => sum + Number(item.count || 0), 0);
  if (!count) return null;
  const sum = items.reduce((total, item) => total + Number(item.sum || 0), 0);
  return Math.round((sum / count) * 100) / 100;
}

function severityFor(value, warning, critical) {
  if (value >= critical) return "critical";
  if (value >= warning) return "warning";
  return null;
}

function evaluateAlerts(options = {}) {
  const snapshot = Array.isArray(options.metricsSnapshot) ? options.metricsSnapshot : [];
  const circuits = Array.isArray(options.openCircuits) ? options.openCircuits : [];
  const config = options.config || alertConfig({});
  const alerts = [];

  const requests = counterTotal(snapshot, "theeb_http_requests_total");
  const serverErrors = counterTotal(
    snapshot,
    "theeb_http_requests_total",
    item => /^5\d\d$/.test(String(item.labels?.status || ""))
  );
  const errorRatio = requests ? serverErrors / requests : 0;

  if (requests >= config.minRequests) {
    const severity = severityFor(
      errorRatio,
      config.httpErrorWarningRatio,
      config.httpErrorCriticalRatio
    );
    if (severity) {
      alerts.push({
        code: "HTTP_5XX_RATIO_HIGH",
        severity,
        value: Math.round(errorRatio * 10000) / 10000,
        threshold: severity === "critical"
          ? config.httpErrorCriticalRatio
          : config.httpErrorWarningRatio
      });
    }
  }

  const averageLatencyMs = histogramAverage(snapshot, "theeb_http_request_duration_ms");
  if (requests >= config.minRequests && averageLatencyMs !== null) {
    const severity = severityFor(
      averageLatencyMs,
      config.httpAvgLatencyWarningMs,
      config.httpAvgLatencyCriticalMs
    );
    if (severity) {
      alerts.push({
        code: "HTTP_AVG_LATENCY_HIGH",
        severity,
        value: averageLatencyMs,
        threshold: severity === "critical"
          ? config.httpAvgLatencyCriticalMs
          : config.httpAvgLatencyWarningMs
      });
    }
  }

  const circuitSeverity = severityFor(
    circuits.length,
    config.openCircuitsWarning,
    config.openCircuitsCritical
  );
  if (circuitSeverity) {
    alerts.push({
      code: "OPEN_CIRCUITS_HIGH",
      severity: circuitSeverity,
      value: circuits.length,
      threshold: circuitSeverity === "critical"
        ? config.openCircuitsCritical
        : config.openCircuitsWarning
    });
  }

  const status = alerts.some(item => item.severity === "critical")
    ? "critical"
    : alerts.length
      ? "warning"
      : "ok";

  return {
    status,
    alerts,
    sample: {
      http_requests: requests,
      http_5xx: serverErrors,
      http_error_ratio: Math.round(errorRatio * 10000) / 10000,
      http_avg_latency_ms: averageLatencyMs,
      open_circuits: circuits.length,
      minimum_http_samples_met: requests >= config.minRequests
    }
  };
}

module.exports = { alertConfig, evaluateAlerts, histogramAverage, counterTotal };
