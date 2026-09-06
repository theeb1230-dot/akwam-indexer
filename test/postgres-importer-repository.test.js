const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PostgresImporterRepository
} = require("../src/repositories/importer-repository");

function fakePool() {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT canonical_series_id AS id/.test(sql)) return { rows: [] };
      if (/INSERT INTO canonical_series/.test(sql)) return { rows: [{ id: "11" }] };
      if (/INSERT INTO canonical_keys/.test(sql)) return { rows: [], rowCount: 1 };
      if (/INSERT INTO provider_series/.test(sql)) return { rows: [], rowCount: 1 };
      if (/SELECT pe\.provider_episode_id/.test(sql)) return { rows: [{ provider_episode_id: "e1" }] };
      if (/UPDATE provider_episodes pe/.test(sql)) return { rows: [], rowCount: 2 };
      if (/SELECT id FROM provider_series/.test(sql)) return { rows: [{ id: "21" }] };
      if (/INSERT INTO canonical_episodes/.test(sql)) return { rows: [{ id: "31" }] };
      if (/INSERT INTO provider_episodes/.test(sql)) return { rows: [{ id: "41" }] };
      if (/SELECT canonical_episode_id/.test(sql)) return { rows: [{ canonical_episode_id: "31" }] };
      if (/INSERT INTO playback_candidates/.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };
  return {
    calls,
    async connect() { return client; },
    async query(sql, values) { return client.query(sql, values); }
  };
}

test("PostgreSQL importer creates provider-scoped canonical identity without guessing merges", async () => {
  const pool = fakePool();
  const repository = new PostgresImporterRepository(pool);
  const id = await repository.upsertSeries("2758", {
    provider: "akwam",
    source_url: "https://example.test/series/2758",
    series: {
      title: "Fixture",
      description: "Description",
      image: "https://example.test/poster.jpg",
      language: "ar",
      quality: "720p",
      country: "TR",
      year: "2022"
    }
  });

  assert.equal(id, 11);
  const advisory = pool.calls.find(call => /pg_advisory_xact_lock/.test(call.sql));
  assert.deepEqual(advisory.values, ["provider:akwam:2758"]);
  assert.ok(pool.calls.some(call => /INSERT INTO provider_series/.test(call.sql)));
});

test("PostgreSQL importer reconciles only missing provider episodes", async () => {
  const pool = fakePool();
  const repository = new PostgresImporterRepository(pool);
  const existing = await repository.existingEpisodeIds(11, "akwam");
  assert.deepEqual(existing, ["e1"]);

  const changed = await repository.reconcileMissingEpisodes(11, "akwam", ["e1", "e2"]);
  assert.equal(changed, 2);
  const update = pool.calls.find(call => /UPDATE provider_episodes pe/.test(call.sql));
  assert.deepEqual(update.values, [11, "akwam", ["e1", "e2"]]);
});

test("PostgreSQL importer persists episode locator without direct media URLs", async () => {
  const pool = fakePool();
  const repository = new PostgresImporterRepository(pool);

  const episodeId = await repository.upsertEpisode(
    11,
    { id: "e2", number: 2, season_number: 3, title: "Episode 2" },
    {
      provider: "akwam",
      source_url: "https://example.test/episode/e2",
      episode: {
        id: "e2",
        title: "Episode 2",
        description: null,
        image: null
      }
    }
  );
  assert.equal(episodeId, 41);
  const canonicalInsert = pool.calls.find(call => /INSERT INTO canonical_episodes/.test(call.sql));
  assert.equal(canonicalInsert.values[1], 3);

  await repository.upsertWatchOption(41, "akwam", {
    watch_id: "w2",
    quality: "720p",
    page_url: "https://example.test/watch/w2/e2"
  });

  const option = pool.calls.find(call => /INSERT INTO playback_options/.test(call.sql));
  assert.ok(option, "public playback capability must be persisted");
  assert.equal(option.values[6], true);
  assert.equal(option.values[7], false);

  const playback = pool.calls.find(call => /INSERT INTO playback_candidates/.test(call.sql));
  assert.equal(playback.values[4], "resolver");
  assert.doesNotMatch(JSON.stringify(playback.values), /direct_url/);
});
