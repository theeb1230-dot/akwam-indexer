#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function readJson(file) {
  if (!fs.existsSync(file)) fail(`MISSING_METADATA_FILE:${path.basename(file)}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function validateMetadata(dir = process.argv[2] || "metadata") {
  const mobile = readJson(path.join(dir, "android-mobile-metadata.json"));
  const tv = readJson(path.join(dir, "android-tv-metadata.json"));
  const ios = readJson(path.join(dir, "ios-metadata.json"));

  if (mobile.platform !== "android-mobile") fail("ANDROID_MOBILE_PLATFORM_MISMATCH");
  if (tv.platform !== "android-tv") fail("ANDROID_TV_PLATFORM_MISMATCH");
  if (ios.platform !== "ios") fail("IOS_PLATFORM_MISMATCH");

  if (!mobile.application_id || !mobile.application_id.startsWith("com.theebarab.")) {
    fail("ANDROID_APPLICATION_ID_INVALID");
  }
  if (tv.application_id !== mobile.application_id) {
    fail("ANDROID_APPLICATION_ID_PARITY_FAILED");
  }
  if (!ios.bundle_id || !ios.bundle_id.startsWith("com.theebarab.")) {
    fail("IOS_BUNDLE_ID_INVALID");
  }

  const versions = new Set([
    `${mobile.version_name}+${mobile.version_code}`,
    `${tv.version_name}+${tv.version_code}`,
    `${ios.version_name}+${ios.version_code}`
  ]);
  if (versions.size !== 1) fail("CLIENT_VERSION_BUILD_PARITY_FAILED");

  const commits = new Set([mobile.commit_sha, tv.commit_sha, ios.commit_sha]);
  if (commits.size !== 1 || !mobile.commit_sha) fail("CLIENT_COMMIT_PARITY_FAILED");

  if (mobile.signature_verified !== true) fail("ANDROID_SIGNATURE_NOT_VERIFIED");
  if (tv.signature_verified !== true) fail("ANDROID_TV_SIGNATURE_NOT_VERIFIED");
  if (tv.leanback_verified !== true) fail("ANDROID_TV_MANIFEST_NOT_VERIFIED");
  if (ios.signing !== "UNSIGNED") fail("EXPERIMENTAL_IOS_SIGNING_STATE_INVALID");
  if (ios.payload_app_count !== 1) fail("IOS_PAYLOAD_STRUCTURE_INVALID");

  return {
    status: "passed",
    commit_sha: mobile.commit_sha,
    version: `${mobile.version_name}+${mobile.version_code}`,
    android_application_id: mobile.application_id,
    ios_bundle_id: ios.bundle_id,
    ios_signing: ios.signing
  };
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(validateMetadata()) + "\n");
  } catch (error) {
    console.error(error.code || error.message);
    process.exit(1);
  }
}

module.exports = { validateMetadata };
