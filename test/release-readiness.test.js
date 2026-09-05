const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateMatrixShape,
  validateReleaseLevel
} = require("../scripts/validate-release-readiness");

function matrixWith(status = "NOT_VERIFIED", evidence = []) {
  const req = value => ({ status: value, evidence: [...evidence] });
  return {
    schema_version: 1,
    levels: {
      experimental: { label: "Experimental", requirements: { a: req(status) } },
      beta: { label: "Beta/Usable", requirements: { b: req(status) } },
      golden: { label: "Golden", requirements: { c: req(status) } },
      complete: { label: "Complete/Stable", requirements: { d: req(status) } }
    }
  };
}

test("release readiness matrix accepts explicit fail-closed states", () => {
  assert.equal(validateMatrixShape(matrixWith()), true);
});

test("PASS entries require evidence", () => {
  assert.throws(
    () => validateMatrixShape(matrixWith("PASS")),
    error => error.code === "PASS_WITHOUT_EVIDENCE:experimental.a"
  );
});

test("release level requires every cumulative requirement to pass", () => {
  const matrix = matrixWith("PASS", ["workflow:123"]);
  assert.equal(validateReleaseLevel("experimental", matrix).level, "experimental");
  assert.deepEqual(validateReleaseLevel("complete", matrix).checked_levels, [
    "experimental",
    "beta",
    "golden",
    "complete"
  ]);

  matrix.levels.beta.requirements.b = {
    status: "NOT_VERIFIED",
    evidence: []
  };
  assert.throws(
    () => validateReleaseLevel("golden", matrix),
    error => error.code === "RELEASE_REQUIREMENT_NOT_PASSED:beta.b:NOT_VERIFIED"
  );
});

test("unknown release levels fail closed", () => {
  assert.throws(
    () => validateReleaseLevel("production", matrixWith()),
    error => error.code === "INVALID_RELEASE_LEVEL"
  );
});
