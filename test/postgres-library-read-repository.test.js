const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
  PostgresLibraryReadRepository
} = require("../src/repositories/library-read-repository");
const {
  createLibraryRouter
} = require("../src/routes/library");

function fakePool() {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });

      if (/COUNT\(\*\)::integer FROM provider_series/.test(sql)) {
        return { rows: [{ series: 2, episodes: 5, watch_options: 7, providers: 2 }] };
      }
      if (/COALESCE\(ps\.provider_title, cs\.title\) ILIKE/.test(sql)) {
        return { rows: [{
          id: "1", provider: "akwam", provider_series_id: "s1",
          title: "Fixture", episode_count: 3
        }] };
      }
      if (/COUNT\(DISTINCT pe\.id\)::integer AS episode_count/.test(sql)) {
        return { rows: [{
          id: "1", provider: "akwam", provider_series_id: "s1",
          title: "Fixture", episode_count: 3
        }] };
      }
      if (/ps\.id AS provider_series_db_id/.test(sql)) {
        return { rows: [{
          provider_series_db_id: "21",
          id: "1",
          provider: "akwam",
          provider_series_id: "s1",
          title: "Fixture"
        }] };
      }
      if (/COUNT\(pc\.id\)::integer AS watch_option_count/.test(sql)) {
        return { rows: [{
          id: "31",
          provider: "akwam",
          provider_episode_id: "e1",
          episode_number: "1",
          title: "Episode 1",
          watch_option_count: 2
        }] };
      }
      if (/cs\.title AS series_title/.test(sql)) {
        return { rows: [{
          id: "31",
          provider: "akwam",
          provider_episode_id: "e1",
          episode_number: "1",
          title: "Episode 1",
          series_title: "Fixture"
        }] };
      }
      if (/FROM playback_candidates pc/.test(sql)) {
        return { rows: [{
          id: "41",
          provider: "akwam",
          watch_id: "w1",
          quality: "720p",
          page_url: "https://example.test/watch"
        }] };
      }
      return { rows: [] };
    }
  };
}

test("PostgreSQL library repository preserves public numeric contract", async () => {
  const pool = fakePool();
  const repository = new PostgresLibraryReadRepository(pool);

  assert.deepEqual(await repository.stats(), {
    series: 2,
    episodes: 5,
    watch_options: 7,
    providers: 2
  });

  const found = await repository.search("Fixture");
  assert.equal(found[0].id, 1);
  assert.equal(found[0].episode_count, 3);

  const detail = await repository.getSeriesEpisodes(1);
  assert.equal(detail.series.id, 1);
  assert.equal(detail.episodes[0].id, 31);
  assert.equal(detail.episodes[0].watch_option_count, 2);

  const episode = await repository.getEpisode(31);
  assert.equal(episode.id, 31);
  assert.equal(episode.watch_options[0].id, 41);
  assert.equal(episode.watch_options[0].page_url, "https://example.test/watch");
});

test("library router serves injected repository without direct database access", async t => {
  const repository = {
    async stats() { return { series: 1, episodes: 1, watch_options: 1, providers: 1 }; },
    async search(q) { return q === "Fixture" ? [{ id: 1, title: "Fixture" }] : []; },
    async listSeries() { return [{ id: 1, title: "Fixture" }]; },
    async getSeriesEpisodes(id) {
      return String(id) === "1"
        ? { series: { id: 1, title: "Fixture" }, episodes: [{ id: 10, episode_number: 1 }] }
        : null;
    },
    async getSeries(id) {
      return String(id) === "1"
        ? { id: 1, title: "Fixture", episode_count: 1, episodes: [{ id: 10 }] }
        : null;
    },
    async getEpisode(id) {
      return String(id) === "10"
        ? { id: 10, title: "Episode 1", watch_options: [{ id: 20 }] }
        : null;
    }
  };

  const app = express();
  app.use("/api/library", createLibraryRouter({ repository }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  assert.equal((await fetch(`${base}/api/library/stats`)).status, 200);
  assert.equal((await fetch(`${base}/api/library/search?q=Fixture`)).status, 200);
  assert.equal((await fetch(`${base}/api/library/search`)).status, 400);
  assert.equal((await fetch(`${base}/api/library/series`)).status, 200);
  assert.equal((await fetch(`${base}/api/library/series/1/episodes`)).status, 200);
  assert.equal((await fetch(`${base}/api/library/series/1`)).status, 200);
  assert.equal((await fetch(`${base}/api/library/episodes/10`)).status, 200);
  assert.equal((await fetch(`${base}/api/library/series/404`)).status, 404);
});
