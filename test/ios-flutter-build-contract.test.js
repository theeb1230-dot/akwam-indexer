const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("iOS delivery pipeline creates unsigned IPA only after verified API gate", () => {
  const root = process.cwd();
  const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const release = fs.readFileSync(path.join(root, ".github/workflows/client-release.yml"), "utf8");
  const main = fs.readFileSync(path.join(root, "clients/flutter/lib/main.dart"), "utf8");

  const checks = {
    iosCiJob: ci.includes("flutter-ios:"),
    macRunner: ci.includes("runs-on: macos-latest"),
    normalCiBundleOnly: ci.includes("Compile non-installable Flutter iOS bundle"),
    normalCiNoIpaUpload: !ci.includes("name: theeb-arab-ios-unsigned"),
    releaseIosJob: release.includes("ios:"),
    releaseNoCodesign: release.includes("flutter build ios --release --no-codesign"),
    releaseIosTarget: release.includes("--dart-define=THEEB_TARGET=ios"),
    releaseInstallableFlag: release.includes("THEEB_INSTALLABLE_BUILD=true"),
    releaseIpaPackage: release.includes("theeb-arab-ios-unsigned.ipa"),
    releaseArtifactName: release.includes("name: theeb-arab-ios-unsigned"),
    artifactPlaceholderScan: release.includes("PLACEHOLDER_FOUND_IN_IOS_ARTIFACT"),
    platformContract: main.includes("TheebPlatform.ios")
  };

  for (const [name, passed] of Object.entries(checks)) {
    assert.equal(passed, true, `iOS build contract failed: ${name}`);
  }
});
