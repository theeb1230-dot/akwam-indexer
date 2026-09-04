const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
  PostgresCanonicalReadRepository
} = require("../src/repositories/canonical-read-repository");
const {
  createCanonicalRouter
} = require("../src/routes/canonical");

function fakePool() {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/COUNT\(DISTINCT ps\.id\)/.test(sql)) {
        return {
          rows: [{
            id: "1",
            title: "Fixture",
            canonical_key: "fixture-key",
            source_count: 2,
            episode_count: 3
          }]
        };
      }
      if (/WHERE cs\.id = \$1/.test(sql)) {
        return {
          rows: [{
            id: "1",
            title: "Fixture",
            canonical_key: "fixture-key"
          }]
        };
      }
      if (/COUNT\(DISTINCT pe\.id\)/.test(sql)) {
        return {
          rows: [{
            id: "10",
            canonical_series_id: "1",
            season_number: "1",
            episode_number: "2",
            source_count: 1,
            playback_option_count: 2
          }]
        };
      }
      if (/SELECT \* FROM canonical_episodes/.test(sql)) {
        return {
          rows: [{
            id: "10",
            canonical_series_id: "1",
            season_number: "1",
            episode_number: "2"
          }]
        };
      }
      if (/FROM playback_candidates pc/.test(sql)) {
        return {
          rows: [{
            provider: "fixture",
            provider_episode_id: "e2",
            watch_id: "w2",
            server: "",
            type: "resolver",
            quality: "720p",
            fallback_order: 1,
            status: "active",
            locator: { provider: "fixture", watch_id: "w2" }
          }]
        };
      }
      return { rows: [] };
    }
  };
}

test("PostgreSQL canonical read repository normalizes ids and counts", async () => {
  const pool = fakePool();
  const repository = new PostgresCanonicalReadRepository(pool);

  const series = await repository.listSeries();
  assert.equal(series[0].id, 1);
  assert.equal(series[0].source_count, 2);
  assert.equal(series[0].episode_count, 3);

  const detail = await repository.getSeriesEpisodes(1);
  assert.equal(detail.series.id, 1);
  assert.equal(detail.episodes[0].id, 10);
  assert.equal(detail.episodes[0].episode_number, 2);

  const playback = await repository.getEpisodePlayback(10);
  assert.equal(playback.episode.id, 10);
  assert.equal(playback.fallbackPlan[0].fallback_order, 1);
  assert.deepEqual(playback.fallbackPlan[0].locator, {
    provider: "fixture",
    watch_id: "w2"
  });
});

test("canonical router serves repository contract without direct database access", async t => {
  const repository = {
    async listSeries() {
      return [{ id: 1, title: "Fixture" }];
    },
    async getSeriesEpisodes(id) {
      if (String(id) !== "1") return null;
      return {
        series: { id: 1, title: "Fixture" },
        episodes: [{ id: 10, episode_number: 1 }]
      };
    },
    async getEpisodePlayback(id) {
      if (String(id) !== "10") return null;
      return {
        episode: { id: 10 },
        fallbackPlan: [{ provider: "fixture", watch_id: "w1" }]
      };
    }
  };

  const app = express();
  app.use("/api/canonical", createCanonicalRouter({ repository }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const list = await fetch(`${base}/api/canonical/series`);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).count, 1);

  const episodes = await fetch(`${base}/api/canonical/series/1/episodes`);
  assert.equal(episodes.status, 200);
  assert.equal((await episodes.json()).count, 1);

  const playback = await fetch(`${base}/api/canonical/episodes/10/playback`);
  assert.equal(playback.status, 200);
  assert.equal((await playback.json()).playback_option_count, 1);

  const missing = await fetch(`${base}/api/canonical/series/404/episodes`);
  assert.equal(missing.status, 404);
});
