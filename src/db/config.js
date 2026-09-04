const DRIVERS = Object.freeze({
  SQLITE: "sqlite",
  POSTGRES: "postgres"
});

function databaseDriver(env = process.env) {
  const configured = String(env.DATABASE_DRIVER || "").trim().toLowerCase();
  const inferred = env.DATABASE_URL ? DRIVERS.POSTGRES : DRIVERS.SQLITE;
  const driver = configured || inferred;

  if (!Object.values(DRIVERS).includes(driver)) {
    const error = new Error(`INVALID_DATABASE_DRIVER: ${driver}`);
    error.code = "INVALID_DATABASE_DRIVER";
    throw error;
  }

  if (driver === DRIVERS.POSTGRES && !env.DATABASE_URL) {
    const error = new Error("DATABASE_URL_REQUIRED");
    error.code = "DATABASE_URL_REQUIRED";
    throw error;
  }

  return driver;
}

module.exports = {
  DRIVERS,
  databaseDriver
};
