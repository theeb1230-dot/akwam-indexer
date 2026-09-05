const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Android TV build remains a distinct zero-cost artifact", () => {
  const root = process.cwd();
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const configurator = fs.readFileSync(path.join(root, "scripts/configure-android-tv.js"), "utf8");
  const config = fs.readFileSync(path.join(root, "clients/dart/lib/theeb_client_config.dart"), "utf8");

  assert.match(workflow, /flutter-android-tv:/);
  assert.match(workflow, /THEEB_TARGET=tv/);
  assert.match(workflow, /theeb-arab-android-tv-debug/);
  assert.match(configurator, /android\.software\.leanback/);
  assert.match(configurator, /android\.hardware\.touchscreen/);
  assert.match(configurator, /LEANBACK_LAUNCHER/);
  assert.match(config, /TheebClientTarget\.tv/);
  assert.match(config, /bool get isTv/);
});
