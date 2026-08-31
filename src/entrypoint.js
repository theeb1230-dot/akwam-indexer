const {
  RUNTIME_ROLES,
  getRuntimeRole,
  assertImplementedRole
} = require(
  "./config/runtime-role"
);

function start(env = process.env) {
  const role =
    assertImplementedRole(
      getRuntimeRole(env)
    );

  switch (role) {
    case RUNTIME_ROLES.ALL:
    case RUNTIME_ROLES.API:
      return require(
        "./server"
      );

    default:
      throw new Error(
        `UNREACHABLE_RUNTIME_ROLE: ${role}`
      );
  }
}

if (require.main === module) {
  try {
    start();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "fatal",
        event:
          "runtime_start_failed",
        role:
          process.env.THEEB_ROLE ||
          RUNTIME_ROLES.ALL,
        error:
          error.code ||
          error.message
      })
    );

    process.exitCode = 1;
  }
}

module.exports = {
  start
};
