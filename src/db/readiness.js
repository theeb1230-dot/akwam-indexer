const { DRIVERS, databaseDriver } = require("./config");

function readinessTtlMs(value, fallback = 2000) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 250 || parsed > 10000) {
    const error = new Error("INVALID_READINESS_SUCCESS_TTL_MS");
    error.code = "INVALID_READINESS_SUCCESS_TTL_MS";
    throw error;
  }
  return parsed;
}

function createCachedCheck(probe, options = {}) {
  const ttlMs = readinessTtlMs(options.ttlMs);
  const now = options.now || Date.now;
  let lastSuccessAt = 0;
  let inFlight = null;

  return async function check() {
    const current = Number(now());
    if (lastSuccessAt && current - lastSuccessAt < ttlMs) {
      return true;
    }

    if (inFlight) return inFlight;

    inFlight = Promise.resolve()
      .then(probe)
      .then(() => {
        lastSuccessAt = Number(now());
        return true;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}

function createDatabaseReadiness(env = process.env) {
  const ttlMs = readinessTtlMs(env.READINESS_SUCCESS_TTL_MS);

  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("./postgres");
    const pool = getPool(env);
    return {
      driver: DRIVERS.POSTGRES,
      check: createCachedCheck(
        async () => {
          await pool.query("SELECT 1 AS ok");
        },
        { ttlMs }
      )
    };
  }

  const db = require("./schema");
  return {
    driver: DRIVERS.SQLITE,
    check: createCachedCheck(
      async () => {
        db.prepare("SELECT 1 AS ok").get();
      },
      { ttlMs }
    )
  };
}

module.exports = {
  createCachedCheck,
  createDatabaseReadiness,
  readinessTtlMs
};
