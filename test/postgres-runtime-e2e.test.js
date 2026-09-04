const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { migrate } = require("../scripts/migrate-postgres");
const { PostgresJobRepository } = require("../src/repositories/postgres-job-repository");
const { PostgresImporterRepository } = require("../src/repositories/importer-repository");
const { PostgresRefreshSeriesRepository } = require("../src/repositories/refresh-series-repository");
const { PostgresDownloadRepository } = require("../src/repositories/download-repository");
const { PostgresV1ReadRepository } = require("../src/repositories/v1-read-repository");

const url = process.env.E2E_POSTGRES_URL;

test("PostgreSQL runtime E2E covers jobs importer refresh download and v1 reads", {
  skip: !url
}, async t => {
  const pool = new Pool({ connectionString: url, ssl: false, max: 4 });
  t.after(async () => pool.end());

  const client = await pool.connect();
  try {
    await migrate({ client });
  } finally {
    client.release();
  }

  await pool.query("TRUNCATE TABLE download_candidates, playback_options, playback_candidates, provider_episodes, canonical_episodes, provider_series, canonical_keys, canonical_series, runtime_jobs RESTART IDENTITY CASCADE");

  const jobs = new PostgresJobRepository(pool);
  const created = await jobs.create({
    type: "import",
    provider: "fixture",
    provider_series_id: "series-1",
    payload: { e2e: true }
  });
  assert.equal(created.status, "queued");

  const claimed = await jobs.claimNext("worker-e2e", ["import"], {
    leaseMs: 30000
  });
  assert.equal(claimed.id, created.id);
  assert.equal(claimed.worker_id, "worker-e2e");

  await jobs.start(created.id, 1);
  await jobs.setCurrentEpisode(created.id, { episode: 1 });
  await jobs.episodeCompleted(created.id);
  const completed = await jobs.complete(created.id, { ok: true });
  assert.equal(completed.status, "completed");
  assert.equal(completed.progress, 100);

  const importer = new PostgresImporterRepository(pool);
  const seriesId = await importer.upsertSeries("series-1", {
    provider: "fixture",
    source_url: "https://example.test/series-1",
    series: {
      title: "E2E Fixture",
      description: "Fixture series",
      image: null,
      language: "ar",
      quality: "720p",
      country: "SA",
      year: "2026"
    }
  });
  assert.equal(seriesId, 1);

  const episodeId = await importer.upsertEpisode(
    seriesId,
    { id: "episode-1", number: 1, title: "Episode 1" },
    {
      provider: "fixture",
      source_url: "https://example.test/episode-1",
      episode: {
        id: "episode-1",
        title: "Episode 1",
        description: null,
        image: null
      }
    }
  );
  assert.equal(episodeId, 1);

  await importer.upsertWatchOption(episodeId, "fixture", {
    watch_id: "watch-1",
    quality: "720p",
    page_url: "https://example.test/watch-1"
  });

  const refresh = new PostgresRefreshSeriesRepository(pool);
  const allSeries = await refresh.listAllSeries();
  assert.equal(allSeries.length, 1);
  assert.equal(allSeries[0].provider_series_id, "series-1");

  const download = new PostgresDownloadRepository(pool);
  const episode = await download.getEpisode(1);
  assert.equal(episode.title, "Episode 1");

  const sources = await download.listSources(1);
  assert.equal(sources.length, 1);

  await download.replaceCandidates(sources[0], [{
    candidate_id: "download-e2e-1",
    provider: "fixture",
    download_id: "d1",
    quality: "720p",
    format: "mp4",
    locator: {
      provider: "fixture",
      provider_episode_id: "episode-1",
      download_id: "d1",
      type: "download_file"
    },
    metadata: {
      filename: "episode-1.mp4"
    }
  }]);

  const persisted = await pool.query(
    "SELECT locator, metadata FROM download_candidates WHERE candidate_key = $1",
    ["download-e2e-1"]
  );
  assert.equal(persisted.rows.length, 1);
  assert.equal(persisted.rows[0].locator.download_id, "d1");
  assert.doesNotMatch(JSON.stringify(persisted.rows[0]), /direct_url|download_url|resolved_url/);

  const v1 = new PostgresV1ReadRepository(pool);
  const search = await v1.searchSeries("E2E Fixture");
  assert.equal(search.length, 1);
  assert.equal(search[0].episode_count, 1);

  const detail = await v1.getSeries(seriesId);
  assert.equal(detail.title, "E2E Fixture");

  const episodes = await v1.listEpisodes(seriesId);
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].watch_count, 0);
  assert.equal(episodes[0].download_count, 0);
});
