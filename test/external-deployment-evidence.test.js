const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildEvidence,
  writeEvidence
} = require("../scripts/write-deployment-evidence");

function env(overrides = {}) {
  return {
    THEEB_EVIDENCE_BASE_URL: "https://api.theeb.sa/",
    THEEB_EVIDENCE_EXPECTED_VERSION: "1.0.0",
    THEEB_EVIDENCE_COMMIT: "abc123",
    THEEB_EVIDENCE_RUN_ID: "42",
    THEEB_EVIDENCE_RUN_NUMBER: "7",
    THEEB_EVIDENCE_REPOSITORY: "theeb1230-dot/akwam-indexer",
    ...overrides
  };
}

test("deployment evidence is tied to HTTPS URL, commit and workflow run", () => {
  const evidence = buildEvidence(env());
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.base_url, "https://api.theeb.sa");
  assert.equal(evidence.commit_sha, "abc123");
  assert.equal(evidence.workflow_run_id, "42");
  assert.equal(evidence.expected_version, "1.0.0");
  assert.ok(evidence.checks.includes("readiness"));
  assert.ok(evidence.checks.includes("dart_client_search_smoke"));
});

test("deployment evidence fails closed on non-HTTPS URLs and missing metadata", () => {
  assert.throws(
    () => buildEvidence(env({ THEEB_EVIDENCE_BASE_URL: "http://api.theeb.sa/" })),
    error => error.code === "EVIDENCE_HTTPS_REQUIRED"
  );
  assert.throws(
    () => buildEvidence(env({ THEEB_EVIDENCE_COMMIT: "" })),
    error => error.code === "MISSING_THEEB_EVIDENCE_COMMIT"
  );
});

test("deployment evidence writer persists a JSON artifact", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "theeb-evidence-"));
  const file = path.join(dir, "evidence.json");
  const evidence = writeEvidence(env({ THEEB_EVIDENCE_PATH: file }));
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(stored.commit_sha, evidence.commit_sha);
  assert.equal(stored.base_url, "https://api.theeb.sa");
});
