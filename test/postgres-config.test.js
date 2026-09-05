const test = require("node:test");
const assert = require("node:assert/strict");

const { poolConfiguration } = require("../src/db/postgres");

test("PostgreSQL pool config uses bounded production-safe defaults", () => {
  assert.deepEqual(poolConfiguration({}), {
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: "theeb-engine"
  });
});

test("PostgreSQL pool config accepts bounded overrides", () => {
  assert.deepEqual(poolConfiguration({
    PG_POOL_MAX: "25",
    PG_IDLE_TIMEOUT_MS: "45000",
    PG_CONNECT_TIMEOUT_MS: "15000",
    PG_APP_NAME: "theeb-api"
  }), {
    max: 25,
    idleTimeoutMillis: 45000,
    connectionTimeoutMillis: 15000,
    application_name: "theeb-api"
  });
});

test("PostgreSQL pool config rejects unsafe numeric values", () => {
  const cases = [
    [{ PG_POOL_MAX: "0" }, "INVALID_PG_POOL_MAX"],
    [{ PG_POOL_MAX: "101" }, "INVALID_PG_POOL_MAX"],
    [{ PG_POOL_MAX: "1.5" }, "INVALID_PG_POOL_MAX"],
    [{ PG_IDLE_TIMEOUT_MS: "999" }, "INVALID_PG_IDLE_TIMEOUT_MS"],
    [{ PG_IDLE_TIMEOUT_MS: "600001" }, "INVALID_PG_IDLE_TIMEOUT_MS"],
    [{ PG_CONNECT_TIMEOUT_MS: "999" }, "INVALID_PG_CONNECT_TIMEOUT_MS"],
    [{ PG_CONNECT_TIMEOUT_MS: "120001" }, "INVALID_PG_CONNECT_TIMEOUT_MS"],
    [{ PG_CONNECT_TIMEOUT_MS: "nope" }, "INVALID_PG_CONNECT_TIMEOUT_MS"]
  ];

  for (const [env, code] of cases) {
    assert.throws(
      () => poolConfiguration(env),
      error => error.code === code
    );
  }
});
