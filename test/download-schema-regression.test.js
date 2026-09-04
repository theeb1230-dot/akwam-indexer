const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../src/db/schema");

function columnNames(table) {
  return new Set(
    db.prepare(`PRAGMA table_info(${table})`)
      .all()
      .map(column => column.name)
  );
}

test("download schema preserves background runtime tables", () => {
  const tables = new Set(
    db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
    `).all().map(table => table.name)
  );

  assert.equal(tables.has("download_candidates"), true);
  assert.equal(tables.has("runtime_jobs"), true);
  assert.equal(tables.has("episode_health_schedule"), true);
});

test("download schema preserves source disappearance columns", () => {
  for (const table of ["episodes", "provider_episodes"]) {
    const columns = columnNames(table);
    assert.equal(columns.has("active"), true, `${table}.active`);
    assert.equal(columns.has("last_seen_at"), true, `${table}.last_seen_at`);
    assert.equal(columns.has("missing_since"), true, `${table}.missing_since`);
  }
});

test("download schema preserves runtime columns added by ensureColumn", () => {
  const columns = columnNames("runtime_jobs");
  assert.equal(columns.has("dedupe_key"), true);
  assert.equal(columns.has("cancel_requested"), true);
});
