const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `theeb-refresh-${process.pid}.sqlite`
);

const db = require("../src/db/schema");
const {
  SqliteImporterRepository
} = require("../src/repositories/importer-repository");
const {
  enqueueDueRefreshJobs
} = require("../src/services/refresh-scheduler");

let seriesCounter = 0;

function seedSeries() {
  seriesCounter += 1;
  const inserted = db.prepare(`
    INSERT INTO series (
      provider, provider_series_id, title, updated_at
    ) VALUES ('fixture', ?, 'Fixture', '2020-01-01 00:00:00')
  `).run(`s${seriesCounter}`);
  return Number(inserted.lastInsertRowid);
}

test("missing provider episodes become inactive without deletion", async () => {
  const seriesId = seedSeries();
  const insert = db.prepare(`
    INSERT INTO episodes (
      series_id, provider, provider_episode_id,
      episode_number, title, active
    ) VALUES (?, 'fixture', ?, ?, ?, 1)
  `);

  insert.run(seriesId, "e1", 1, "E1");
  insert.run(seriesId, "e2", 2, "E2");

  const repository = new SqliteImporterRepository(db);
  const changed = await repository.reconcileMissingEpisodes(
    seriesId,
    "fixture",
    ["e2"]
  );

  assert.equal(changed, 1);
  const rows = db.prepare(`
    SELECT provider_episode_id, active, missing_since
    FROM episodes WHERE series_id = ? ORDER BY episode_number
  `).all(seriesId);

  assert.equal(rows[0].active, 0);
  assert.ok(rows[0].missing_since);
  assert.equal(rows[1].active, 1);
  assert.equal(rows.length, 2);
});

test("stale refresh scheduling deduplicates active jobs", async () => {
  seedSeries();
  const first = await enqueueDueRefreshJobs({
    now: new Date("2026-08-31T00:00:00.000Z"),
    ttlMs: 1000
  });
  const second = await enqueueDueRefreshJobs({
    now: new Date("2026-08-31T00:00:00.000Z"),
    ttlMs: 1000
  });

  assert.ok(first.queued >= 1);
  assert.equal(second.queued, 0);
  assert.ok(second.deduplicated >= 1);
});
