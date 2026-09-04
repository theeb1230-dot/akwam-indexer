const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { closePool } = require("../src/db/postgres");
const { createDatabaseReadiness } = require("../src/db/readiness");

test("database readiness defaults to SQLite locally", async () => {
  const readiness = createDatabaseReadiness({});
  assert.equal(readiness.driver, "sqlite");
  assert.equal(await readiness.check(), true);
});

test("database readiness selects PostgreSQL without importing SQLite", async t => {
  t.after(closePool);
  const readiness = createDatabaseReadiness({
    DATABASE_DRIVER: "postgres",
    DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/theeb",
    PGSSLMODE: "require"
  });

  assert.equal(readiness.driver, "postgres");

  const source = fs.readFileSync(
    path.join(process.cwd(), "src/server.js"),
    "utf8"
  );
  assert.doesNotMatch(source, /require\(["']\.\/db\/schema["']\)/);
  assert.match(source, /await jobs\.getAll\(\)/);
  assert.match(source, /await jobs\.create\(/);
  assert.match(source, /await jobs\.get\(/);
  assert.match(source, /await jobs\.requestCancel\(/);
});
