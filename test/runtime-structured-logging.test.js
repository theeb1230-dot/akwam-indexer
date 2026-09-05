const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("runtime control paths use bounded structured logging", () => {
  const root = process.cwd();
  const files = [
    "src/server.js",
    "src/entrypoint.js",
    "src/workers/worker-runner.js",
    "src/workers/refresh-worker.js",
    "src/workers/health-worker.js"
  ];
  const sources = Object.fromEntries(
    files.map(file => [file, fs.readFileSync(path.join(root, file), "utf8")])
  );

  assert.match(sources["src/server.js"], /logger\.info\("server_started"/);
  assert.match(sources["src/server.js"], /logger\.error\("provider_series_failed"/);
  assert.match(sources["src/server.js"], /error_code:/);
  assert.match(sources["src/entrypoint.js"], /logger\.error\("runtime_start_failed"/);
  assert.match(sources["src/workers/worker-runner.js"], /logger\.info\("worker_started"/);
  assert.match(sources["src/workers/worker-runner.js"], /logger\.error\("job_heartbeat_failed"/);
  assert.match(sources["src/workers/refresh-worker.js"], /logger\.error\("refresh_schedule_failed"/);
  assert.match(sources["src/workers/health-worker.js"], /logger\.error\("health_schedule_failed"/);

  for (const [file, source] of Object.entries(sources)) {
    assert.doesNotMatch(
      source,
      /console\.(?:log|error|warn)\(/,
      file + " must not bypass the structured logger"
    );
  }
});
