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
  if (!["require", "verify-ca", "verify-full"].includes(mode)) {
    const error = new Error("POSTGRES_TLS_VERIFICATION_REQUIRED");
    error.code = "POSTGRES_TLS_VERIFICATION_REQUIRED";
    throw error;
  }

  return { rejectUnauthorized: true };
}

function getPool(env = process.env) {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(env),
      ssl: sslConfiguration(env),
      max: Number(env.PG_POOL_MAX || 10),
      idleTimeoutMillis: Number(env.PG_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(env.PG_CONNECT_TIMEOUT_MS || 10000),
      application_name: env.PG_APP_NAME || "theeb-engine"
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
  getPool,
  withTransaction,
  closePool
};
