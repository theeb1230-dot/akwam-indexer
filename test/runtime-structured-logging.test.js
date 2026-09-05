const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("critical runtime paths use the structured observability logger", () => {
  const root = process.cwd();
  const files = [
    "src/server.js",
    "src/middleware/security.js",
    "src/workers/worker-runner.js",
    "src/workers/refresh-worker.js",
    "src/workers/health-worker.js"
  ];

  const content = Object.fromEntries(
    files.map(file => [file, fs.readFileSync(path.join(root, file), "utf8")])
  );

  assert.match(content["src/server.js"], /logger\.info\("server_started"/);
  assert.match(content["src/server.js"], /logger\.error\("provider_series_failed"/);
  assert.match(content["src/server.js"], /request_id: req\.requestId/);
  assert.match(content["src/middleware/security.js"], /logger\.error\("http_unhandled_error"/);
  assert.match(content["src/workers/worker-runner.js"], /logger\.info\("worker_started"/);
  assert.match(content["src/workers/worker-runner.js"], /logger\.error\("job_heartbeat_failed"/);
  assert.match(content["src/workers/refresh-worker.js"], /logger\.error\("refresh_schedule_failed"/);
  assert.match(content["src/workers/health-worker.js"], /logger\.error\("health_schedule_failed"/);

  for (const [file, source] of Object.entries(content)) {
    assert.doesNotMatch(
      source,
      /console\.(?:log|error|warn)\(/,
      file + " must not bypass the structured logger"
    );
  }
});
