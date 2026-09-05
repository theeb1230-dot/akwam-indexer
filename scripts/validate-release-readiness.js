#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ORDER = ["experimental", "beta", "golden", "complete"];
const ALLOWED = new Set(["PASS", "FAIL", "NOT_VERIFIED"]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function loadMatrix(filePath = path.join(process.cwd(), "docs/release-readiness.json")) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (parsed?.schema_version !== 1 || !parsed.levels) fail("INVALID_RELEASE_READINESS_MATRIX");
  return parsed;
}

function validateEntry(name, entry, requirePass) {
  if (!entry || !ALLOWED.has(entry.status)) fail(`INVALID_READINESS_STATUS:${name}`);
  if (!Array.isArray(entry.evidence)) fail(`INVALID_READINESS_EVIDENCE:${name}`);
  if (entry.status === "PASS" && entry.evidence.length === 0) {
    fail(`PASS_WITHOUT_EVIDENCE:${name}`);
  }
  if (requirePass && entry.status !== "PASS") {
    fail(`RELEASE_REQUIREMENT_NOT_PASSED:${name}:${entry.status}`);
  }
}

function validateReleaseLevel(level, matrix = loadMatrix()) {
  const normalized = String(level || "").trim().toLowerCase();
  const index = ORDER.indexOf(normalized);
  if (index === -1) fail("INVALID_RELEASE_LEVEL");

  for (let i = 0; i <= index; i += 1) {
    const levelName = ORDER[i];
    const spec = matrix.levels[levelName];
    if (!spec || !spec.requirements) fail(`MISSING_RELEASE_LEVEL:${levelName}`);

    for (const [name, entry] of Object.entries(spec.requirements)) {
      validateEntry(`${levelName}.${name}`, entry, true);
    }
  }

  return {
    level: normalized,
    label: matrix.levels[normalized].label,
    checked_levels: ORDER.slice(0, index + 1)
  };
}

function validateMatrixShape(matrix = loadMatrix()) {
  for (const levelName of ORDER) {
    const spec = matrix.levels[levelName];
    if (!spec || !spec.requirements) fail(`MISSING_RELEASE_LEVEL:${levelName}`);
    for (const [name, entry] of Object.entries(spec.requirements)) {
      validateEntry(`${levelName}.${name}`, entry, false);
    }
  }
  return true;
}

if (require.main === module) {
  try {
    const matrix = loadMatrix();
    validateMatrixShape(matrix);
    const level = process.env.THEEB_RELEASE_LEVEL;
    if (level) {
      const result = validateReleaseLevel(level, matrix);
      process.stdout.write(JSON.stringify({ status: "passed", ...result }) + "\n");
    } else {
      process.stdout.write(JSON.stringify({ status: "matrix-valid" }) + "\n");
    }
  } catch (error) {
    console.error(error.code || error.message);
    process.exit(1);
  }
}

module.exports = {
  ORDER,
  loadMatrix,
  validateMatrixShape,
  validateReleaseLevel
};
