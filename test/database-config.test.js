const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  DRIVERS,
  databaseDriver
} = require("../src/db/config");
const {
  sslConfiguration
} = require("../src/db/postgres");

test("SQLite remains the local default", () => {
  assert.equal(databaseDriver({}), DRIVERS.SQLITE);
});

test("DATABASE_URL selects PostgreSQL", () => {
  assert.equal(
    databaseDriver({ DATABASE_URL: "postgresql://fixture/db" }),
    DRIVERS.POSTGRES
  );
});

test("PostgreSQL configuration fails without a URL", () => {
  assert.throws(
    () => databaseDriver({ DATABASE_DRIVER: "postgres" }),
    error => error.code === "DATABASE_URL_REQUIRED"
  );
});

test("PostgreSQL TLS verifies certificates by default", () => {
  assert.deepEqual(sslConfiguration({}), {
    rejectUnauthorized: true
  });
});

test("PostgreSQL rejects insecure TLS modes", () => {
  for (const PGSSLMODE of ["disable", "no-verify", "allow", "prefer"]) {
    assert.throws(
      () => sslConfiguration({
        PGSSLMODE,
        DATABASE_URL: "postgresql://fixture:secret@db.example/theeb"
      }),
      error => error.code === "POSTGRES_TLS_VERIFICATION_REQUIRED"
    );
  }
});

test("PostgreSQL allows TLS disable only for loopback tests", () => {
  assert.equal(
    sslConfiguration({
      PGSSLMODE: "disable",
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/theeb"
    }),
    false
  );

  assert.throws(
    () => sslConfiguration({
      PGSSLMODE: "disable",
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/theeb"
    }),
    error => error.code === "POSTGRES_TLS_VERIFICATION_REQUIRED"
  );

  assert.throws(
    () => sslConfiguration({
      PGSSLMODE: "disable",
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:postgres@db.example/theeb"
    }),
    error => error.code === "POSTGRES_TLS_VERIFICATION_REQUIRED"
  );
});

test("initial PostgreSQL migration preserves storage invariants", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "migrations/postgresql/001_initial.sql"),
    "utf8"
  );

  assert.match(sql, /runtime_jobs_active_dedupe/);
  assert.match(sql, /ON DELETE CASCADE/);
  assert.match(sql, /locator JSONB/);
  assert.doesNotMatch(sql, /direct_url/i);
});
