const logger = require("./observability/logger");
const {
  RUNTIME_ROLES,
  getRuntimeRole,
  assertImplementedRole
} = require(
  "./config/runtime-role"
);

function start(env = process.env) {
  if (String(env.NODE_ENV || "").toLowerCase() === "production") {
    require("./config/production").validateProductionConfig(env);
  }

  const role =
    assertImplementedRole(
      getRuntimeRole(env)
    );

  switch (role) {
    case RUNTIME_ROLES.ALL:
    case RUNTIME_ROLES.API:
      return require("./server").startServer();

    case RUNTIME_ROLES.REFRESH_WORKER:
      return require(
        "./workers/refresh-worker"
      ).startRefreshWorker({ signal: env.THEEB_SIGNAL });

    case RUNTIME_ROLES.HEALTH_WORKER:
      return require(
        "./workers/health-worker"
      ).startHealthWorker({ signal: env.THEEB_SIGNAL });

    default:
      throw new Error(
        `UNREACHABLE_RUNTIME_ROLE: ${role}`
      );
  }
}

if (require.main === module) {
  const controller = new AbortController();
  const { installShutdownHandlers } = require("./runtime/shutdown");

  Promise.resolve()
    .then(() => {
      const runtime = start({ ...process.env, THEEB_SIGNAL: controller.signal });
      installShutdownHandlers({
        controller,
        server: runtime && typeof runtime.close === "function" ? runtime : null,
        completion: runtime && typeof runtime.then === "function" ? runtime : null
      });
      return runtime;
    })
    .catch(error => {
    logger.error("runtime_start_failed", {
      role: process.env.THEEB_ROLE || RUNTIME_ROLES.ALL,
      error_code: error.code || "RUNTIME_START_FAILED"
    });

      process.exitCode = 1;
    });
}

module.exports = {
  start
};
