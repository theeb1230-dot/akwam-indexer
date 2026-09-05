const { databaseDriver } = require("../db/config");
const { databaseUrl, sslConfiguration } = require("../db/postgres");
const {
  RUNTIME_ROLES,
  getRuntimeRole,
  assertImplementedRole
} = require("./runtime-role");

function validateProductionConfig(env = process.env) {
  const errors = [];
  const zeroCostOnly = String(env.THEEB_ZERO_COST_ONLY || "false").toLowerCase() === "true";
  const target = String(env.THEEB_DEPLOYMENT_TARGET || "").trim().toLowerCase();
  let role;

  try {
    role = assertImplementedRole(getRuntimeRole(env));
  } catch (error) { errors.push(error.code || error.message); }

  try {
    if (databaseDriver(env) !== "postgres") errors.push("PRODUCTION_POSTGRES_REQUIRED");
  } catch (error) { errors.push(error.code || error.message); }

  try {
    const url = databaseUrl(env);
    let parsed;
    try { parsed = new URL(url); } catch { errors.push("INVALID_DATABASE_URL"); }
    if (parsed && !["postgres:", "postgresql:"].includes(parsed.protocol)) {
      errors.push("POSTGRES_DATABASE_URL_REQUIRED");
    }
    if (/REPLACE_|CHANGE_ME|localhost/i.test(url)) {
      errors.push("DATABASE_URL_PLACEHOLDER_OR_LOCALHOST");
    }
  } catch (error) { errors.push(error.code || error.message); }

  try { sslConfiguration(env); } catch (error) { errors.push(error.code || error.message); }
  if (String(env.NODE_ENV || "") !== "production") errors.push("NODE_ENV_PRODUCTION_REQUIRED");
  if (role === RUNTIME_ROLES.ALL) errors.push("DEDICATED_RUNTIME_ROLE_REQUIRED");
  if (String(env.PGSSLMODE || "").toLowerCase() !== "verify-full") {
    errors.push("PG_VERIFY_FULL_REQUIRED");
  }
  if (env.POSTGRES_RUNTIME_PARITY !== "verified") {
    errors.push("POSTGRES_RUNTIME_PARITY_NOT_VERIFIED");
  }

  if (zeroCostOnly) {
    const allowed = new Set([
      "cloudflare-workers-free",
      "oracle-always-free",
      "koyeb-free",
      "neon-free",
      "render-free",
      "github-actions",
      "local"
    ]);
    if (!target) errors.push("ZERO_COST_DEPLOYMENT_TARGET_REQUIRED");
    else if (!allowed.has(target)) errors.push("NON_ZERO_COST_TARGET_REJECTED");
  }

  for (const [name, min, max] of [
    ["SHUTDOWN_TIMEOUT_MS", 1000, 300000],
    ["PG_POOL_MAX", 1, 100],
    ["PG_CONNECT_TIMEOUT_MS", 100, 60000]
  ]) {
    if (env[name] !== undefined) {
      const value = Number(env[name]);
      if (!Number.isInteger(value) || value < min || value > max) {
        errors.push(`INVALID_${name}`);
      }
    }
  }

  if (errors.length) {
    const error = new Error("INVALID_PRODUCTION_CONFIGURATION");
    error.code = "INVALID_PRODUCTION_CONFIGURATION";
    error.details = [...new Set(errors)];
    throw error;
  }

  return {
    role,
    database: "postgres",
    tls: "verified",
    zero_cost_only: zeroCostOnly,
    deployment_target: target || null
  };
}

module.exports = { validateProductionConfig };
