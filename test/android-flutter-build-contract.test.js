const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Android delivery pipeline separates normal CI from verified installable artifacts", () => {
  const root = process.cwd();
  const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const release = fs.readFileSync(path.join(root, ".github/workflows/client-release.yml"), "utf8");
  const pubspec = fs.readFileSync(path.join(root, "clients/flutter/pubspec.yaml"), "utf8");
  const main = fs.readFileSync(path.join(root, "clients/flutter/lib/main.dart"), "utf8");
  const tvConfigurator = fs.readFileSync(path.join(root, "clients/flutter/tool/configure_android_tv.dart"), "utf8");
  const brand = fs.readFileSync(path.join(root, "clients/dart/lib/theeb_brand.dart"), "utf8");

  const checks = {
    normalAndroidJob: ci.includes("flutter-android:"),
    normalCiBundleOnly: ci.includes("flutter build bundle"),
    normalCiNoInstallableUpload: !ci.includes("name: theeb-arab-android-debug"),
    releaseApkBuild: release.includes("Build installable Android APK"),
    releaseApkPath: release.includes("app-release.apk"),
    releaseArtifactName: release.includes("name: theeb-arab-android"),
    releaseApiRequired: release.includes("THEEB_INSTALLABLE_API_BASE_URL"),
    releaseInstallableFlag: release.includes("THEEB_INSTALLABLE_BUILD=true"),
    artifactPlaceholderScan: release.includes("PLACEHOLDER_FOUND_IN_ANDROID_ARTIFACT"),
    appName: pubspec.includes("name: theeb_arab"),
    sharedClientPath: pubspec.includes("path: ../dart"),
    arabicBrand: brand.includes("ذيب العرب"),
    sharedBrandUsage: main.includes("TheebBrand.productNameAr"),
    apiClientUsage: main.includes("TheebApiClient("),
    tvJob: ci.includes("flutter-android-tv:"),
    tvReleaseBuild: release.includes("Build installable Android TV APK"),
    tvTarget: release.includes("--dart-define=THEEB_TARGET=tv"),
    tvArtifact: release.includes("name: theeb-arab-android-tv"),
    leanback: tvConfigurator.includes("android.software.leanback"),
    noTouchscreenRequirement: tvConfigurator.includes("android.hardware.touchscreen"),
    tvPlatformContract: main.includes("TheebPlatform.androidTv")
  };

  for (const [name, passed] of Object.entries(checks)) {
    assert.equal(passed, true, `Android build contract failed: ${name}`);
  }
});
