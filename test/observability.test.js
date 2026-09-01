const test = require("node:test");
const assert = require("node:assert/strict");
const { redact } = require("../src/observability/redact");
const metrics = require("../src/observability/metrics");
const logger = require("../src/observability/logger");
const { routeName } = require("../src/middleware/observability");

test("structured logger deeply redacts secrets and temporary URLs", () => {
  const original = console.log;
  let line;
  console.log = value => { line = value; };
  try {
    logger.info("candidate_checked", {
      provider: "wecima",
      authorization: "Bearer secret",
      candidate: { direct_url: "https://temporary.example/video.mp4", quality: "720p" }
    });
  } finally {
    console.log = original;
  }
  const record = JSON.parse(line);
  assert.equal(record.provider, "wecima");
  assert.equal(record.authorization, "[redacted]");
  assert.equal(record.candidate.direct_url, "[redacted]");
  assert.equal(record.candidate.quality, "720p");
});

test("redactor handles circular structures", () => {
  const value = { token: "secret" };
  value.self = value;
  assert.deepEqual(redact(value), { token: "[redacted]", self: "[circular]" });
});

test("redactor removes sensitive values even under generic keys", () => {
  assert.deepEqual(redact({ message: "failed https://temporary.example/video.mp4" }), {
    message: "[redacted]"
  });
});

test("metrics reject unsafe label values and export Prometheus text", () => {
  metrics.reset();
  metrics.increment("theeb_test_total", { provider: "akwam", url: "https://secret.test" });
  const item = metrics.snapshot()[0];
  assert.deepEqual(item.labels, { provider: "akwam" });
  assert.match(metrics.prometheus(), /theeb_test_total\{provider="akwam"\} 1/);
  assert.doesNotMatch(metrics.prometheus(), /secret/);
});

test("metrics expose bounded request latency histograms", () => {
  metrics.reset();
  metrics.observe("theeb_http_request_duration_ms", { route: "search" }, 125);
  const output = metrics.prometheus();
  assert.match(output, /theeb_http_request_duration_ms_bucket\{route="search",le="250"\} 1/);
  assert.match(output, /theeb_http_request_duration_ms_count\{route="search"\} 1/);
});

test("metric series cardinality is bounded under hostile labels", () => {
  metrics.reset();
  for (let index = 0; index < 500; index += 1) {
    metrics.increment("theeb_cardinality_test_total", { route: `route-${index}` });
  }
  const series = metrics.snapshot().filter(item => item.name === "theeb_cardinality_test_total");
  assert.equal(series.length, metrics.MAX_SERIES_PER_METRIC);
  assert.ok(series.some(item => item.labels.overflow === "true"));
});

test("bounded label dimensions collapse unknown telemetry values", () => {
  assert.deepEqual(metrics.normalizedLabels({
    event: "attacker-controlled-event",
    platform: "custom-device-123"
  }), { event: "other", platform: "unknown" });
});

test("request logs use route templates rather than concrete identifiers", () => {
  assert.equal(routeName({ baseUrl: "/v1/episodes", route: { path: "/:id" } }), "/v1/episodes/:id");
  assert.equal(routeName({ path: "/v1/episodes/private-id" }), "unmatched");
});

test("logger fields cannot override the structured envelope", () => {
  const original = console.log;
  let line;
  console.log = value => { line = value; };
  try {
    logger.info("safe_event", { event: "forged", level: "error", timestamp: "forged" });
  } finally {
    console.log = original;
  }
  const record = JSON.parse(line);
  assert.equal(record.event, "safe_event");
  assert.equal(record.level, "info");
  assert.notEqual(record.timestamp, "forged");
});
