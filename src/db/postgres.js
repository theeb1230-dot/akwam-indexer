const { Pool } = require("pg");
const fs = require("node:fs");

let pool;

function databaseUrl(env = process.env) {
  if (env.DATABASE_URL && env.DATABASE_URL_FILE) {
    const error = new Error("DATABASE_URL_SOURCE_AMBIGUOUS");
    error.code = "DATABASE_URL_SOURCE_AMBIGUOUS";
    throw error;
  }
  if (env.DATABASE_URL_FILE) {
    const stat = fs.statSync(env.DATABASE_URL_FILE);
    if (!stat.isFile() || stat.size > 16384) {
      const error = new Error("INVALID_DATABASE_URL_FILE");
      error.code = "INVALID_DATABASE_URL_FILE";
      throw error;
    }
  }
  const value = env.DATABASE_URL || (
    env.DATABASE_URL_FILE
      ? fs.readFileSync(env.DATABASE_URL_FILE, "utf8").trim()
      : ""
  );
  if (!value) {
    const error = new Error("DATABASE_URL_REQUIRED");
    error.code = "DATABASE_URL_REQUIRED";
    throw error;
  }
  return value;
}

function sslConfiguration(env = process.env) {
  const mode = String(env.PGSSLMODE || "require").toLowerCase();

  if (mode === "disable") {
    const url = new URL(databaseUrl(env));
    const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
    const testOnly = String(env.NODE_ENV || "").toLowerCase() === "test";
    if (loopback && testOnly) return false;

    const error = new Error("POSTGRES_TLS_VERIFICATION_REQUIRED");
    error.code = "POSTGRES_TLS_VERIFICATION_REQUIRED";
    throw error;
  }

  if (!["require", "verify-ca", "verify-full"].includes(mode)) {
    const error = new Error("POSTGRES_TLS_VERIFICATION_REQUIRED");
    error.code = "POSTGRES_TLS_VERIFICATION_REQUIRED";
    throw error;
  }

  return { rejectUnauthorized: true };
}

function boundedInteger(value, fallback, minimum, maximum, code) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  return parsed;
}

function poolConfiguration(env = process.env) {
  return Object.freeze({
    max: boundedInteger(env.PG_POOL_MAX, 10, 1, 100, "INVALID_PG_POOL_MAX"),
    idleTimeoutMillis: boundedInteger(
      env.PG_IDLE_TIMEOUT_MS,
      30000,
      1000,
      600000,
      "INVALID_PG_IDLE_TIMEOUT_MS"
    ),
    connectionTimeoutMillis: boundedInteger(
      env.PG_CONNECT_TIMEOUT_MS,
      10000,
      1000,
      120000,
      "INVALID_PG_CONNECT_TIMEOUT_MS"
    ),
    application_name: env.PG_APP_NAME || "theeb-engine"
  });
}

function getPool(env = process.env) {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(env),
      ssl: sslConfiguration(env),
      ...poolConfiguration(env)
    });
  }

  return pool;
}

async function withTransaction(callback, env = process.env) {
  const client = await getPool(env).connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}

module.exports = {
  databaseUrl,
  sslConfiguration,
  poolConfiguration,
  getPool,
  withTransaction,
  closePool
};
