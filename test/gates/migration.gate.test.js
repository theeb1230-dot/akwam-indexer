const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { TABLES, mapRow, insertStatement, checksum } = require("../../src/db/sqlite-postgres-transfer");
const { gateConnectionString } = require("../../scripts/gates/postgres-migration-drill");

test("PostgreSQL migration contains required durable constraints", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../migrations/postgresql/001_initial.sql"), "utf8");
  for (const table of TABLES) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), table);
  assert.match(sql, /ON DELETE CASCADE/);
  assert.match(sql, /runtime_jobs_active_dedupe/);
  assert.match(sql, /playback_candidates[\s\S]*locator JSONB/);
  assert.doesNotMatch(sql, /direct_url/i);
});

test("transfer mapping is deterministic and parameterized", () => {
  const row = mapRow("runtime_jobs", { id: "00000000-0000-4000-8000-000000000001", payload_json: '{"episode":15}', cancel_requested: 0 });
  assert.deepEqual(row.payload, { episode: 15 });
  assert.equal(row.cancel_requested, false);
  const statement = insertStatement("runtime_jobs", row);
  assert.match(statement.sql, /VALUES \(\$1, \$2, \$3\)/);
  assert.equal(statement.values.length, 3);
  assert.equal(checksum([row]), checksum([row]));
});

test("transfer rejects unsupported table names", () => {
  assert.throws(() => insertStatement("runtime_jobs; DROP TABLE runtime_jobs", { id: "x" }), /UNSUPPORTED_TRANSFER_TABLE/);
});

test("migration drill refuses remote or implicit databases", () => {
  assert.throws(() => gateConnectionString({}), /GATE_DATABASE_URL_REQUIRED/);
  assert.throws(
    () => gateConnectionString({ GATE_DATABASE_URL: "postgres://user:pass@db.example.test/theeb" }),
    /GATE_DATABASE_MUST_BE_LOCAL/
  );
  assert.equal(
    gateConnectionString({ GATE_DATABASE_URL: "postgres://postgres:postgres@127.0.0.1/theeb_gate" }),
    "postgres://postgres:postgres@127.0.0.1/theeb_gate"
  );
});
