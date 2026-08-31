const { Pool } = require("pg");

let pool;

function sslConfiguration(env = process.env) {
  const mode = String(env.PGSSLMODE || "require").toLowerCase();
  if (mode === "disable") return false;

  return {
    rejectUnauthorized:
      mode !== "no-verify"
  };
}

function getPool(env = process.env) {
  if (!env.DATABASE_URL) {
    const error = new Error("DATABASE_URL_REQUIRED");
    error.code = "DATABASE_URL_REQUIRED";
    throw error;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
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
  sslConfiguration,
  getPool,
  withTransaction,
  closePool
};
