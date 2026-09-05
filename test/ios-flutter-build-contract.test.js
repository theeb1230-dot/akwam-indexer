const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("iOS Flutter build pipeline produces a separate unsigned IPA artifact", () => {
  const root = process.cwd();
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const main = fs.readFileSync(path.join(root, "clients/flutter/lib/main.dart"), "utf8");

  const checks = {
    iosJob: workflow.includes("flutter-ios:"),
    macRunner: workflow.includes("runs-on: macos-latest"),
    iosScaffold: workflow.includes("flutter create --platforms=ios"),
    noCodesign: workflow.includes("flutter build ios --release --no-codesign"),
    iosTarget: workflow.includes("--dart-define=THEEB_TARGET=ios"),
    ipaPackage: workflow.includes("theeb-arab-ios-unsigned.ipa"),
    artifactName: workflow.includes("theeb-arab-ios-unsigned"),
    platformContract: main.includes("TheebPlatform.ios")
  };

  for (const [name, passed] of Object.entries(checks)) {
    assert.equal(passed, true, `iOS build contract failed: ${name}`);
  }
});
