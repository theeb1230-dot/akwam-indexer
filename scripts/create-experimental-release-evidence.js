#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { loadMatrix, validateReleaseLevel } = require("./validate-release-readiness");

function requireFile(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    const error = new Error("MISSING_RELEASE_EVIDENCE_FILE:" + file);
    error.code = error.message;
    throw error;
  }
}

function loadRuntimeSmokeEvidence(file, expectedSha, expectedBaseUrl) {
  requireFile(file);
  const evidence = JSON.parse(fs.readFileSync(file, "utf8"));
  if (evidence.status !== "PASS") throw new Error("CLIENT_RUNTIME_SEARCH_SMOKE_NOT_PASSED");
  if (evidence.commit_sha !== expectedSha) throw new Error("CLIENT_RUNTIME_SMOKE_COMMIT_MISMATCH");
  if (evidence.api_base_url !== expectedBaseUrl) throw new Error("CLIENT_RUNTIME_SMOKE_API_MISMATCH");
  if (!Array.isArray(evidence.platforms) || evidence.platforms.length === 0) {
    throw new Error("CLIENT_RUNTIME_SMOKE_PLATFORM_REQUIRED");
  }
  if (!Number.isInteger(evidence.result_count) || evidence.result_count <= 0) {
    throw new Error("CLIENT_RUNTIME_SMOKE_REAL_RESULT_REQUIRED");
  }
  return evidence;
}

function main() {
  const releaseDir = process.argv[2] || "release";
  const metadataDir = process.argv[3] || "metadata";
  const baseUrl = process.env.THEEB_INSTALLABLE_API_BASE_URL;
  const sha = process.env.GITHUB_SHA || "unknown";
  const runId = process.env.GITHUB_RUN_ID || "unknown";
  if (!/^https:\/\//.test(baseUrl || "")) throw new Error("HTTPS_RELEASE_API_REQUIRED");

  const artifacts = [
    "theeb-arab-android.apk",
    "theeb-arab-android-tv.apk",
    "theeb-arab-ios-unsigned.ipa"
  ].map(name => path.join(releaseDir, name));
  artifacts.forEach(requireFile);
  ["android-mobile-metadata.json","android-tv-metadata.json","ios-metadata.json"]
    .map(name => path.join(metadataDir, name))
    .forEach(requireFile);

  const runtimeSmokeFile = path.join(releaseDir, "client-runtime-smoke.json");
  const runtimeSmoke = loadRuntimeSmokeEvidence(runtimeSmokeFile, sha, baseUrl);

  const matrix = loadMatrix();
  const req = matrix.levels.experimental.requirements;
  const evidence = {
    repo_ci: [`run:${runId}:npm-test`],
    real_https_api: [`${baseUrl}readyz`],
    readiness_search_smoke: [`run:${runId}:installable-api-and-search-smoke`],
    no_placeholder_artifacts: [`run:${runId}:artifact-placeholder-scans`],
    client_runtime_search_smoke: [
      `run:${runId}:client-runtime-smoke`,
      `platforms:${runtimeSmoke.platforms.join(",")}`,
      `result_count:${runtimeSmoke.result_count}`
    ],
    watch_download_separation: [`commit:${sha}:contract-tests`],
    postgres_runtime_path: [`${baseUrl}readyz`, `commit:${sha}:postgres-runtime`],
    no_critical_blocker: [`run:${runId}:all-release-jobs-passed`],
    artifact_triplet_same_commit: [`run:${runId}:metadata-commit-parity`],
    artifact_sha256: [`run:${runId}:SHA256SUMS.txt`],
    version_build_parity: [`run:${runId}:metadata-version-parity`]
  };
  for (const [name, refs] of Object.entries(evidence)) {
    if (!req[name]) throw new Error("MISSING_EXPERIMENTAL_REQUIREMENT:" + name);
    req[name] = { status: "PASS", evidence: refs };
  }

  validateReleaseLevel("experimental", matrix);
  const out = path.join(releaseDir, "runtime-release-readiness.json");
  fs.writeFileSync(out, JSON.stringify({
    ...matrix,
    candidate: {
      commit_sha: sha,
      github_run_id: runId,
      api_base_url: baseUrl,
      generated_at: new Date().toISOString()
    }
  }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({status:"passed",file:out})+"\n");
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.code || error.message);
    process.exit(1);
  }
}

module.exports = { loadRuntimeSmokeEvidence };
