const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  RUNTIME_ROLES,
  normalizeRuntimeRole,
  getRuntimeRole,
  assertImplementedRole
} = require(
  "../src/config/runtime-role"
);

test("runtime role defaults to backward-compatible all", () => {
  assert.equal(
    getRuntimeRole({}),
    RUNTIME_ROLES.ALL
  );
});

test("runtime role normalization is deterministic", () => {
  assert.equal(
    normalizeRuntimeRole(
      " API "
    ),
    RUNTIME_ROLES.API
  );
});

test("unknown runtime roles fail closed", () => {
  assert.throws(
    () =>
      getRuntimeRole({
        THEEB_ROLE:
          "unknown-worker"
      }),
    error =>
      error.code ===
      "INVALID_THEEB_ROLE"
  );
});

test("API role is implemented now", () => {
  assert.equal(
    assertImplementedRole(
      RUNTIME_ROLES.API
    ),
    RUNTIME_ROLES.API
  );
});

test("unimplemented worker roles fail closed", () => {
  assert.throws(
    () =>
      assertImplementedRole(
        RUNTIME_ROLES.PLAYBACK_WORKER
      ),
    error =>
      error.code ===
      "THEEB_ROLE_NOT_IMPLEMENTED"
  );
});

test("refresh worker is implemented with durable jobs", () => {
  assert.equal(
    assertImplementedRole(
      RUNTIME_ROLES.REFRESH_WORKER
    ),
    RUNTIME_ROLES.REFRESH_WORKER
  );
});

test("health worker is implemented with TTL scheduling", () => {
  assert.equal(
    assertImplementedRole(
      RUNTIME_ROLES.HEALTH_WORKER
    ),
    RUNTIME_ROLES.HEALTH_WORKER
  );
});
