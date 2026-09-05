const test = require("node:test");
const assert = require("node:assert/strict");

const { alertConfig, evaluateAlerts } = require("../src/observability/alerts");

function counter(status, value) {
  return {
    name: "theeb_http_requests_total",
    type: "counter",
    labels: { status },
    value
  };
}

function latency(count, sum) {
  return {
    name: "theeb_http_request_duration_ms",
    type: "histogram",
    labels: {},
    count,
    sum,
    buckets: []
  };
}

test("alerts stay ok with no meaningful samples", () => {
  const result = evaluateAlerts({
    metricsSnapshot: [],
    openCircuits: [],
    config: alertConfig({})
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(result.alerts, []);
  assert.equal(result.sample.minimum_http_samples_met, false);
});

test("HTTP 5xx ratio becomes critical after minimum sample size", () => {
  const result = evaluateAlerts({
    metricsSnapshot: [counter("200", 80), counter("500", 20)],
    openCircuits: [],
    config: alertConfig({})
  });
  assert.equal(result.status, "critical");
  assert.equal(result.alerts[0].code, "HTTP_5XX_RATIO_HIGH");
  assert.equal(result.alerts[0].value, 0.2);
});

test("average latency produces a bounded warning without request details", () => {
  const result = evaluateAlerts({
    metricsSnapshot: [counter("200", 20), latency(20, 40000)],
    openCircuits: [],
    config: alertConfig({})
  });
  const alert = result.alerts.find(item => item.code === "HTTP_AVG_LATENCY_HIGH");
  assert.equal(alert.severity, "warning");
  assert.equal(alert.value, 2000);
  assert.deepEqual(Object.keys(alert).sort(), ["code", "severity", "threshold", "value"]);
});

test("open circuit count escalates independently of HTTP volume", () => {
  const result = evaluateAlerts({
    metricsSnapshot: [],
    openCircuits: [{}, {}, {}, {}, {}],
    config: alertConfig({})
  });
  assert.equal(result.status, "critical");
  assert.equal(result.alerts[0].code, "OPEN_CIRCUITS_HIGH");
});

test("alert thresholds must preserve warning below critical", () => {
  assert.throws(
    () => alertConfig({
      ALERT_HTTP_ERROR_WARNING_RATIO: "0.2",
      ALERT_HTTP_ERROR_CRITICAL_RATIO: "0.1"
    }),
    error => error.code === "INVALID_ALERT_HTTP_ERROR_THRESHOLD_ORDER"
  );
  assert.throws(
    () => alertConfig({
      ALERT_HTTP_AVG_LATENCY_WARNING_MS: "4000",
      ALERT_HTTP_AVG_LATENCY_CRITICAL_MS: "3000"
    }),
    error => error.code === "INVALID_ALERT_HTTP_LATENCY_THRESHOLD_ORDER"
  );
  assert.throws(
    () => alertConfig({
      ALERT_OPEN_CIRCUITS_WARNING: "5",
      ALERT_OPEN_CIRCUITS_CRITICAL: "5"
    }),
    error => error.code === "INVALID_ALERT_OPEN_CIRCUIT_THRESHOLD_ORDER"
  );
});

test("alert thresholds reject unsafe configuration", () => {
  assert.throws(
    () => alertConfig({ ALERT_HTTP_ERROR_WARNING_RATIO: "2" }),
    error => error.code === "INVALID_ALERT_HTTP_ERROR_WARNING_RATIO"
  );
  assert.throws(
    () => alertConfig({ ALERT_MIN_REQUESTS: "0" }),
    error => error.code === "INVALID_ALERT_MIN_REQUESTS"
  );
});
