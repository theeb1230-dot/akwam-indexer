const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { validateMetadata } = require("../scripts/validate-client-artifact-metadata");

function writeFixture(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "theeb-client-meta-"));
  const base = {
    commit_sha: "abc123",
    version_name: "0.1.0",
    version_code: "1"
  };

  const mobile = {
    ...base,
    platform: "android-mobile",
    application_id: "com.theebarab.theeb_arab",
    signature_verified: true,
    ...(overrides.mobile || {})
  };
  const tv = {
    ...base,
    platform: "android-tv",
    application_id: "com.theebarab.theeb_arab",
    signature_verified: true,
    leanback_verified: true,
    ...(overrides.tv || {})
  };
  const ios = {
    ...base,
    platform: "ios",
    bundle_id: "com.theebarab.theebArab",
    signing: "UNSIGNED",
    payload_app_count: 1,
    ...(overrides.ios || {})
  };

  fs.writeFileSync(path.join(dir, "android-mobile-metadata.json"), JSON.stringify(mobile));
  fs.writeFileSync(path.join(dir, "android-tv-metadata.json"), JSON.stringify(tv));
  fs.writeFileSync(path.join(dir, "ios-metadata.json"), JSON.stringify(ios));
  return dir;
}

test("artifact metadata validator accepts one commit and version across all three clients", () => {
  const result = validateMetadata(writeFixture());
  assert.equal(result.status, "passed");
  assert.equal(result.version, "0.1.0+1");
  assert.equal(result.commit_sha, "abc123");
  assert.equal(result.ios_signing, "UNSIGNED");
});

test("artifact metadata validator rejects version or commit drift", () => {
  assert.throws(
    () => validateMetadata(writeFixture({ ios: { version_code: "2" } })),
    error => error.code === "CLIENT_VERSION_BUILD_PARITY_FAILED"
  );
  assert.throws(
    () => validateMetadata(writeFixture({ tv: { commit_sha: "other" } })),
    error => error.code === "CLIENT_COMMIT_PARITY_FAILED"
  );
});

test("artifact metadata validator rejects missing platform integrity evidence", () => {
  assert.throws(
    () => validateMetadata(writeFixture({ mobile: { signature_verified: false } })),
    error => error.code === "ANDROID_SIGNATURE_NOT_VERIFIED"
  );
  assert.throws(
    () => validateMetadata(writeFixture({ tv: { leanback_verified: false } })),
    error => error.code === "ANDROID_TV_MANIFEST_NOT_VERIFIED"
  );
  assert.throws(
    () => validateMetadata(writeFixture({ ios: { payload_app_count: 2 } })),
    error => error.code === "IOS_PAYLOAD_STRUCTURE_INVALID"
  );
});

test("artifact metadata validator rejects unexpected product identifiers", () => {
  assert.throws(
    () => validateMetadata(writeFixture({ mobile: { application_id: "com.example.app" } })),
    error => error.code === "ANDROID_APPLICATION_ID_INVALID"
  );
  assert.throws(
    () => validateMetadata(writeFixture({ ios: { bundle_id: "com.example.app" } })),
    error => error.code === "IOS_BUNDLE_ID_INVALID"
  );
});
