const { DRIVERS, databaseDriver } = require("./config");

function createDatabaseReadiness(env = process.env) {
  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("./postgres");
    const pool = getPool(env);
    return {
      driver: DRIVERS.POSTGRES,
      async check() {
        await pool.query("SELECT 1 AS ok");
        return true;
      }
    };
  }

  const db = require("./schema");
  return {
    driver: DRIVERS.SQLITE,
    async check() {
      db.prepare("SELECT 1 AS ok").get();
      return true;
    }
  };
}

module.exports = {
  createDatabaseReadiness
};
