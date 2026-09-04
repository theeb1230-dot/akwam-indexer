const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { migrate } = require("../scripts/migrate-postgres");

const migrationVersions = () => fs.readdirSync(path.join(process.cwd(), "migrations", "postgresql"))
  .filter(file => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
  .sort()
  .map(file => file.replace(/\.sql$/, ""));

test("migration runner applies unapplied files once", async () => {
  const expected = migrationVersions();
  const queries = [];
  const client = { async query(sql) { queries.push(sql); if (/SELECT version/.test(sql)) return { rows: [] }; return { rows: [] }; } };
  const result = await migrate({ client });
  assert.deepEqual(result.executed, expected);
  assert.ok(queries.some(sql => /CREATE TABLE IF NOT EXISTS canonical_series/.test(sql)));
  for (const version of expected) assert.ok(queries.some(sql => sql.includes(`VALUES ('${version}')`)), `${version} must record itself`);
});

test("migration runner skips recorded versions", async () => {
  const applied = migrationVersions().map(version => ({ version }));
  const client = { async query(sql) { if (/SELECT version/.test(sql)) return { rows: applied }; return { rows: [] }; } };
  const result = await migrate({ client });
  assert.deepEqual(result.executed, []);
});
