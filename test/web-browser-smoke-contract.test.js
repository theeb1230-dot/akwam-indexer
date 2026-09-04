const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Theeb Arab PWA Chromium smoke remains wired into CI", () => {
  const root = process.cwd();
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/provider-recovery.yml"),
    "utf8"
  );
  const smoke = fs.readFileSync(
    path.join(root, "scripts/web-browser-smoke.js"),
    "utf8"
  );

  assert.equal(pkg.scripts["test:web-browser"], "node scripts/web-browser-smoke.js");
  assert.match(workflow, /web-browser-smoke:/);
  assert.match(workflow, /npm run test:web-browser/);
  assert.match(smoke, /google-chrome/);
  assert.match(smoke, /WEB_SMOKE_SEARCH_FLOW_FAILED/);
  assert.match(smoke, /WEB_SMOKE_SERIES_FLOW_FAILED/);
  assert.match(smoke, /WEB_SMOKE_EPISODE_FLOW_FAILED/);
});
