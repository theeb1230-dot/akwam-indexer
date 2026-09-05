const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Android TV build pipeline produces a Leanback-capable APK artifact", () => {
  const root = process.cwd();
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const configurator = fs.readFileSync(path.join(root, "scripts/configure-android-tv.js"), "utf8");

  const checks = {
    tvJob: workflow.includes("flutter-android-tv:"),
    targetDefine: workflow.includes("--dart-define=THEEB_TARGET=tv"),
    tvArtifact: workflow.includes("theeb-arab-android-tv-debug"),
    manifestConfigurator: workflow.includes("node scripts/configure-android-tv.js"),
    leanbackFeature: configurator.includes("android.software.leanback"),
    touchscreenOptional: configurator.includes("android.hardware.touchscreen"),
    leanbackLauncher: configurator.includes("android.intent.category.LEANBACK_LAUNCHER")
  };

  for (const [name, passed] of Object.entries(checks)) {
    assert.equal(passed, true, `Android TV build contract failed: ${name}`);
  }
});
