#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function required(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) {
    const error = new Error(`MISSING_${name}`);
    error.code = `MISSING_${name}`;
    throw error;
  }
  return value;
}

function buildEvidence(env = process.env) {
  const baseUrl = new URL(required(env, "THEEB_EVIDENCE_BASE_URL"));
  if (baseUrl.protocol !== "https:") {
    const error = new Error("EVIDENCE_HTTPS_REQUIRED");
    error.code = "EVIDENCE_HTTPS_REQUIRED";
    throw error;
  }

  return {
    schema_version: 1,
    status: "passed",
    classification_scope: "external-deployment",
    repository: required(env, "THEEB_EVIDENCE_REPOSITORY"),
    commit_sha: required(env, "THEEB_EVIDENCE_COMMIT"),
    workflow_run_id: required(env, "THEEB_EVIDENCE_RUN_ID"),
    workflow_run_number: required(env, "THEEB_EVIDENCE_RUN_NUMBER"),
    base_url: baseUrl.origin,
    expected_version: required(env, "THEEB_EVIDENCE_EXPECTED_VERSION"),
    checks: [
      "public_https_dns",
      "liveness",
      "readiness",
      "api_metadata",
      "pwa_shell",
      "search_contract",
      "dart_client_search_smoke"
    ]
  };
}

function writeEvidence(env = process.env) {
  const output = required(env, "THEEB_EVIDENCE_PATH");
  const evidence = buildEvidence(env);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
  return evidence;
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(writeEvidence()) + "\n");
  } catch (error) {
    console.error(error.code || error.message);
    process.exit(1);
  }
}

module.exports = { buildEvidence, writeEvidence };
