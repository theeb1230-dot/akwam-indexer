const test = require("node:test");
const assert = require("node:assert/strict");
const { redact } = require("../src/observability/redact");
const metrics = require("../src/observability/metrics");
const logger = require("../src/observability/logger");

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

test("metrics reject unsafe label values and export Prometheus text", () => {
  metrics.reset();
  metrics.increment("theeb_test_total", { provider: "akwam", url: "https://secret.test" });
  const item = metrics.snapshot()[0];
  assert.deepEqual(item.labels, { provider: "akwam" });
  assert.match(metrics.prometheus(), /theeb_test_total\{provider="akwam"\} 1/);
  assert.doesNotMatch(metrics.prometheus(), /secret/);
});
