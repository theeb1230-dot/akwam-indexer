const test = require("node:test");
const assert = require("node:assert/strict");
const { mapRow, insertStatement, checksum } = require("../src/db/sqlite-postgres-transfer");

test("transfer converts SQLite JSON and booleans to PostgreSQL values", () => {
  assert.deepEqual(mapRow("provider_series", {
    id: 1,
    active: 1,
    metadata_json: '{"source":"fixture"}'
  }), {
    id: 1,
    active: true,
    metadata: { source: "fixture" }
  });
});

test("transfer uses parameterized inserts", () => {
  const statement = insertStatement("canonical_series", { id: 4, title: "Lucky" });
  assert.equal(statement.sql, "INSERT INTO canonical_series (id, title) VALUES ($1, $2)");
  assert.deepEqual(statement.values, [4, "Lucky"]);
  assert.throws(() => insertStatement("arbitrary_table", { id: 1 }), /UNSUPPORTED_TRANSFER_TABLE/);
});

test("transfer checksums are stable and order-sensitive", () => {
  const rows = [{ id: 1 }, { id: 2 }];
  assert.equal(checksum(rows), checksum(rows));
  assert.notEqual(checksum(rows), checksum([...rows].reverse()));
});
