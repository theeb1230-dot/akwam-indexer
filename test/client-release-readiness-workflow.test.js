const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("client release workflow is fail-closed on classification and evidence", () => {
  const workflow = fs.readFileSync(
    path.join(process.cwd(), ".github/workflows/client-release.yml"),
    "utf8"
  );

  for (const required of [
    "release_level:",
    "release-readiness:",
    "THEEB_RELEASE_LEVEL:",
    "push:",
    "release/trigger.json",
    "https://theeb-arab-api.onrender.com",
    "node scripts/create-experimental-release-evidence.js release metadata",
    "runtime-release-readiness.json",
    "sha256sum theeb-arab-android.apk",
    "release-manifest.json",
    "theeb-arab-release-evidence",
    "CURRENT_WORKFLOW_ONLY_SUPPORTS_EXPERIMENTAL_UNSIGNED_IOS",
    "iOS IPA is UNSIGNED/ADHOC",
    "Verify Android package identity, version and signature",
    "Verify Android TV package identity, version, signature and TV manifest",
    "Verify iOS bundle identity, version and unsigned IPA structure",
    "node scripts/validate-client-artifact-metadata.js metadata",
    "android-mobile-metadata.json",
    "android-tv-metadata.json",
    "ios-metadata.json"
  ]) {
    assert.equal(workflow.includes(required), true, required);
  }

  assert.equal(
    workflow.indexOf("release-readiness:") < workflow.indexOf("publish-release:"),
    true,
    "readiness gate must run before publication"
  );
  assert.match(workflow, /needs: \[release-readiness\]/);
  assert.match(workflow, /THEEB_RELEASE_TAG:.*v0\.2\.3-experimental\.1/);
  assert.match(workflow, /npm ci && npm test/);
  assert.match(workflow, /PLACEHOLDER_FOUND_IN_APPLICATION_SOURCE/);
  assert.doesNotMatch(workflow, /Enforce cumulative release readiness matrix/);
  assert.match(workflow, /RELEASE_TAG_INPUT:.*env\.THEEB_RELEASE_TAG/);
  assert.match(workflow, /IOS_IPA_HAS_DISTRIBUTION_IDENTITY/);
});

test("release readiness source-of-truth contains all four cumulative levels", () => {
  const matrix = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "docs/release-readiness.json"),
      "utf8"
    )
  );

  assert.deepEqual(Object.keys(matrix.levels), [
    "experimental",
    "beta",
    "golden",
    "complete"
  ]);
  for (const level of Object.values(matrix.levels)) {
    assert.ok(Object.keys(level.requirements).length > 0);
  }
});


test("Experimental release evidence does not treat Dart CLI as app runtime smoke", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "scripts/create-experimental-release-evidence.js"),
    "utf8"
  );
  assert.doesNotMatch(
    source,
    /client_runtime_search_smoke:\s*\[.*dart-client-search-smoke/,
    "Dart CLI smoke must not satisfy client runtime application evidence"
  );
});
