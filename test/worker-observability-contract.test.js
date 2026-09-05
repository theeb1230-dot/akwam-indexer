const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workerFiles = [
  "src/workers/health-worker.js",
  "src/workers/refresh-worker.js",
  "src/workers/worker-runner.js"
];

test("background worker runtime logs use the structured redacting logger", () => {
  for (const relative of workerFiles) {
    const source = fs.readFileSync(path.join(process.cwd(), relative), "utf8");
    assert.match(source, /observability\/logger/, relative);
    assert.doesNotMatch(source, /console\.(?:log|error)\s*\(/, relative);
  }
});

test("scheduler and heartbeat failures log bounded codes instead of raw messages", () => {
  const health = fs.readFileSync(
    path.join(process.cwd(), "src/workers/health-worker.js"),
    "utf8"
  );
  const refresh = fs.readFileSync(
    path.join(process.cwd(), "src/workers/refresh-worker.js"),
    "utf8"
  );
  const runner = fs.readFileSync(
    path.join(process.cwd(), "src/workers/worker-runner.js"),
    "utf8"
  );

  assert.match(health, /logger\.error\("health_schedule_failed"/);
  assert.match(refresh, /logger\.error\("refresh_schedule_failed"/);
  assert.match(runner, /logger\.error\("job_heartbeat_failed"/);
  assert.doesNotMatch(health, /health_schedule_failed[\s\S]{0,160}error\.message/);
  assert.doesNotMatch(refresh, /refresh_schedule_failed[\s\S]{0,160}error\.message/);
  assert.doesNotMatch(runner, /job_heartbeat_failed[\s\S]{0,160}error\.message/);
  assert.match(runner, /logger\.info\("worker_started"/);
  assert.match(runner, /logger\.info\("worker_stopped"/);
});
