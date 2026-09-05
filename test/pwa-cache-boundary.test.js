const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(process.cwd(), "web", "service-worker.js"),
  "utf8"
);

test("service worker caches only an explicit same-origin shell allowlist", () => {
  assert.match(source, /theeb-arab-shell-v7/);
  assert.match(source, /const SHELL_PATHS = new Set\(SHELL\)/);
  assert.match(source, /url\.origin === self\.location\.origin/);
  assert.match(source, /SHELL_PATHS\.has\(url\.pathname\)/);
  assert.match(source, /!url\.search/);

  assert.doesNotMatch(
    source,
    /url\.pathname\.startsWith\(["']\/v1\//,
    "API safety must not rely on a blacklist"
  );
  assert.doesNotMatch(
    source,
    /url\.pathname\.startsWith\(["']\/api\//,
    "API safety must not rely on a blacklist"
  );
});

test("sensitive and health routes are documented as network-only", () => {
  for (const route of ["/api", "/v1", "/internal/admin", "/readyz", "/livez"]) {
    assert.match(source, new RegExp(route.replace("/", "\\/")));
  }
  assert.match(source, /Everything outside the explicit shell allowlist stays network-only/);
});

test("old shell caches are deleted during activation", () => {
  assert.match(source, /keys\.filter\(key => key !== CACHE\)\.map\(key => caches\.delete\(key\)\)/);
});
