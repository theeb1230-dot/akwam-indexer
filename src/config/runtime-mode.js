const {
  RUNTIME_ROLES,
  getRuntimeRole
} = require("./runtime-role");

function shouldExecuteJobsInline(
  env = process.env
) {
  return getRuntimeRole(env) ===
    RUNTIME_ROLES.ALL;
}

module.exports = {
  shouldExecuteJobsInline
};
