const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PostgresCanonicalRepository
} = require("../src/repositories/canonical-repository");

function fakePool(sequence = []) {
  const calls = [];
  const client = {
    calls,
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, params });
      if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rows: [{ pg_advisory_xact_lock: null }], rowCount: 1 };
      }
      const next = sequence.shift();
      if (!next) throw new Error(`UNEXPECTED_SQL: ${normalized}`);
      return next;
    },
    release() {
      calls.push({ sql: "RELEASE", params: [] });
    }
  };

  return {
    client,
    async connect() {
      return client;
    }
  };
}

test("PostgreSQL canonical series write is transactional and key-locked", async () => {
  const pool = fakePool([
    { rows: [], rowCount: 0 },
    { rows: [{ id: 41, title: "Fixture" }], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [{ id: 51 }], rowCount: 1 },
    { rows: [{ id: 61 }], rowCount: 1 },
    { rows: [], rowCount: 1 }
  ]);
  const repository = new PostgresCanonicalRepository(pool);

  const result = await repository.saveResolvedSeries({
    title: "Fixture",
    content_type: "series",
    providers: [{
      provider: "fixture",
      ok: true,
      provider_series_id: "s1",
      title: "Fixture source",
      source_url: "https://example.invalid/s1"
    }],
    episodes: [{
      season: 1,
      number: 1,
      title: "E1",
      sources: [{
        provider: "fixture",
        provider_episode_id: "e1",
        source_url: "https://example.invalid/e1"
      }]
    }]
  }, "series:fixture");

  assert.deepEqual(result, {
    persisted: true,
    canonical_key: "series:fixture",
    canonical_series_id: 41
  });

  const sql = pool.client.calls.map(call => call.sql);
  assert.equal(sql[0], "BEGIN");
  assert.match(sql[1], /pg_advisory_xact_lock/);
  assert.match(sql[2], /FROM canonical_keys/);
  assert.match(sql[3], /INSERT INTO canonical_series/);
  assert.match(sql[4], /INSERT INTO canonical_keys/);
  assert.match(sql[5], /INSERT INTO provider_series/);
  assert.match(sql[6], /INSERT INTO canonical_episodes/);
  assert.match(sql[7], /INSERT INTO provider_episodes/);
  assert.equal(sql[8], "COMMIT");
  assert.equal(sql[9], "RELEASE");
});

test("PostgreSQL canonical playback candidate persists locators, not direct URLs", async () => {
  const pool = fakePool([
    { rows: [{ id: 41 }], rowCount: 1 },
    { rows: [{ id: 61 }], rowCount: 1 },
    { rows: [{ id: 71 }], rowCount: 1 },
    { rows: [], rowCount: 1 }
  ]);
  const repository = new PostgresCanonicalRepository(pool);

  const result = await repository.saveResolvedEpisode({
    season: 1,
    episode: 1,
    playback_plan: [{
      provider: "fixture",
      episode_id: "e1",
      watch_id: "w1",
      server: "main",
      type: "hls",
      quality: "720p",
      direct_url: "https://temporary.invalid/video.m3u8?token=secret"
    }]
  }, "series:fixture");

  assert.equal(result.saved_playback_candidates, 1);

  const insert = pool.client.calls.find(call =>
    /INSERT INTO playback_candidates/.test(call.sql)
  );
  assert.ok(insert);
  const serializedLocator = insert.params[8];
  assert.equal(serializedLocator.includes("direct_url"), false);
  assert.equal(serializedLocator.includes("temporary.invalid"), false);
  assert.match(insert.sql, /locator/);
});
