const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
  PostgresV1ReadRepository
} = require("../src/repositories/v1-read-repository");
const {
  createV1Router
} = require("../src/routes/v1");

function fakePool() {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });

      if (/cs\.title ILIKE/.test(sql)) {
        return {
          rows: [{
            id: "1",
            title: "Fixture",
            original_title: null,
            content_type: "series",
            status: "ready",
            episode_count: 2
          }]
        };
      }

      if (/WHERE cs\.id = \$1/.test(sql) && /episode_count/.test(sql)) {
        return {
          rows: [{
            id: "1",
            title: "Fixture",
            content_type: "series",
            status: "ready",
            episode_count: 2
          }]
        };
      }

      if (/SELECT id FROM canonical_series/.test(sql)) {
        return { rows: [{ id: "1" }] };
      }

      if (/WHERE ce\.canonical_series_id = \$1/.test(sql)) {
        return {
          rows: [{
            id: "10",
            canonical_series_id: "1",
            season_number: "1",
            episode_number: "2",
            title: "Episode 2",
            watch_count: 1,
            download_count: 1
          }]
        };
      }

      if (/WHERE ce\.id = \$1/.test(sql)) {
        return {
          rows: [{
            id: "10",
            canonical_series_id: "1",
            season_number: "1",
            episode_number: "2",
            title: "Episode 2",
            watch_count: 1,
            download_count: 0
          }]
        };
      }

      return { rows: [] };
    }
  };
}

test("PostgreSQL v1 read repository preserves canonical API contract", async () => {
  const pool = fakePool();
  const repository = new PostgresV1ReadRepository(pool);

  const search = await repository.searchSeries("Fixture");
  assert.equal(search[0].id, 1);
  assert.equal(search[0].episode_count, 2);
  assert.match(pool.calls[0].sql, /ILIKE/);
  assert.deepEqual(pool.calls[0].values, ["%Fixture%", "Fixture"]);

  const series = await repository.getSeries(1);
  assert.equal(series.id, 1);

  const episodes = await repository.listEpisodes(1);
  assert.equal(episodes[0].id, 10);
  assert.equal(episodes[0].watch_count, 1);
  assert.equal(episodes[0].download_count, 1);

  const episode = await repository.getEpisode(10);
  assert.equal(episode.canonical_series_id, 1);
  assert.equal(episode.download_count, 0);
});

test("v1 router serves async repository without direct SQLite access", async t => {
  const repository = {
    async searchSeries(query) {
      return query === "Fixture"
        ? [{ id: 1, title: "Fixture", content_type: "series", status: "ready", episode_count: 1 }]
        : [];
    },
    async getSeries(id) {
      return Number(id) === 1
        ? { id: 1, title: "Fixture", content_type: "series", status: "ready", episode_count: 1 }
        : null;
    },
    async listEpisodes(id) {
      return Number(id) === 1
        ? [{
            id: 10,
            canonical_series_id: 1,
            season_number: 1,
            episode_number: 1,
            title: "Episode 1",
            watch_count: 1,
            download_count: 1
          }]
        : null;
    },
    async getEpisode(id) {
      return Number(id) === 10
        ? {
            id: 10,
            canonical_series_id: 1,
            season_number: 1,
            episode_number: 1,
            title: "Episode 1",
            watch_count: 1,
            download_count: 0
          }
        : null;
    }
  };

  const sessions = {
    async createSession() { throw new Error("unused"); },
    async getSession() { return null; },
    async recordFeedback() { throw new Error("unused"); },
    async downloadOptions() { return []; }
  };

  const app = express();
  app.use(express.json());
  app.use("/api/v1", createV1Router({ repository, sessions }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const search = await fetch(`${base}/api/v1/search?q=Fixture`);
  assert.equal(search.status, 200);
  assert.equal((await search.json()).data.count, 1);

  const series = await fetch(`${base}/api/v1/series/1`);
  assert.equal(series.status, 200);
  assert.equal((await series.json()).data.id, 1);

  const episodes = await fetch(`${base}/api/v1/series/1/episodes`);
  assert.equal(episodes.status, 200);
  const episodeList = await episodes.json();
  assert.equal(episodeList.data.items[0].watch_available, true);
  assert.equal(episodeList.data.items[0].download_available, true);

  const episode = await fetch(`${base}/api/v1/episodes/10`);
  assert.equal(episode.status, 200);
  const episodeBody = await episode.json();
  assert.equal(episodeBody.data.watch_available, true);
  assert.equal(episodeBody.data.download_available, false);

  assert.equal((await fetch(`${base}/api/v1/series/404`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/search`)).status, 400);
});
