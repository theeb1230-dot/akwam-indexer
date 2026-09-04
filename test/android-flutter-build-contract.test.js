const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Android Flutter build pipeline remains wired to a real APK artifact", () => {
  const root = process.cwd();
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const pubspec = fs.readFileSync(path.join(root, "clients/flutter/pubspec.yaml"), "utf8");
  const main = fs.readFileSync(path.join(root, "clients/flutter/lib/main.dart"), "utf8");
  const brand = fs.readFileSync(path.join(root, "clients/dart/lib/theeb_brand.dart"), "utf8");

  const checks = {
    flutterJob: workflow.includes("flutter-android:"),
    apkBuild: workflow.includes("flutter build apk --debug"),
    artifactName: workflow.includes("theeb-arab-android-debug"),
    apkPath: workflow.includes("app-debug.apk"),
    appName: pubspec.includes("name: theeb_arab"),
    sharedClientPath: pubspec.includes("path: ../dart"),
    arabicBrand: brand.includes("ذيب العرب"),
    sharedBrandUsage: main.includes("TheebBrand.productNameAr"),
    apiClientUsage: main.includes("TheebApiClient(")
  };

  for (const [name, passed] of Object.entries(checks)) {
    assert.equal(passed, true, `Android build contract failed: ${name}`);
  }
});
