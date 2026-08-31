const RUNTIME_ROLES = Object.freeze({
  ALL: "all",
  API: "api",
  HEALTH_WORKER: "health-worker",
  REFRESH_WORKER: "refresh-worker",
  PLAYBACK_WORKER: "playback-worker"
});

const IMPLEMENTED_ROLES = new Set([
  RUNTIME_ROLES.ALL,
  RUNTIME_ROLES.API,
  RUNTIME_ROLES.REFRESH_WORKER
]);

function normalizeRuntimeRole(value) {
  return String(
    value || RUNTIME_ROLES.ALL
  )
    .trim()
    .toLowerCase();
}

function getRuntimeRole(env = process.env) {
  const role =
    normalizeRuntimeRole(
      env.THEEB_ROLE
    );

  if (
    !Object.values(
      RUNTIME_ROLES
    ).includes(role)
  ) {
    const error =
      new Error(
        `INVALID_THEEB_ROLE: ${role}`
      );

    error.code =
      "INVALID_THEEB_ROLE";

    throw error;
  }

  return role;
}

function assertImplementedRole(role) {
  if (!IMPLEMENTED_ROLES.has(role)) {
    const error =
      new Error(
        `THEEB_ROLE_NOT_IMPLEMENTED: ${role}`
      );

    error.code =
      "THEEB_ROLE_NOT_IMPLEMENTED";

    throw error;
  }

  return role;
}

module.exports = {
  RUNTIME_ROLES,
  IMPLEMENTED_ROLES,
  normalizeRuntimeRole,
  getRuntimeRole,
  assertImplementedRole
};
