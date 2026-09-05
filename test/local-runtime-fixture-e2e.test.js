const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "theeb-runtime-fixture-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_DRIVER = "sqlite";
process.env.DATABASE_PATH = path.join(tempDir, "runtime.sqlite");
process.env.THEEB_ROLE = "api";
process.env.THEEB_AUTH_REQUIRED = "false";

const providers = require("../src/providers");
const jobs = require("../src/services/job-manager");
const { runImportJob } = require("../src/services/importer");
const { runOnce } = require("../src/workers/worker-runner");
const { startServer } = require("../src/server");
const db = require("../src/db/schema");

const providerName = "fixture-e2e";
if (!providers.has(providerName)) {
  providers.register(providerName, {
    name: "Local Fixture",
    async getSeries(seriesId) {
      assert.equal(String(seriesId), "series-1");
      return {
        provider: providerName,
        source_url: "https://fixture.invalid/series/series-1",
        series: {
          title: "Local Runtime Fixture",
          description: "Offline fixture used to verify the full runtime cycle.",
          image: null,
          language: "ar",
          quality: "720p",
          country: "SA",
          year: "2026"
        },
        episodes: [
          { id: "episode-1", number: 1, title: "Episode 1" },
          { id: "episode-2", number: 2, title: "Episode 2" }
        ]
      };
    },
    async getEpisode(episodeId) {
      const id = String(episodeId);
      assert.match(id, /^episode-[12]$/);
      return {
        provider: providerName,
        source_url: `https://fixture.invalid/episodes/${id}`,
        episode: {
          id,
          title: id === "episode-1" ? "Episode 1" : "Episode 2",
          description: null,
          image: null
        },
        watch_options: [{
          watch_id: `watch-${id}`,
          quality: "720p",
          page_url: `https://fixture.invalid/watch/${id}`
        }]
      };
    }
  });
}

async function json(response) {
  const body = await response.json();
  assert.ok(response.ok, `HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

test("local fixture covers API -> Job -> Worker -> Repository without live providers", async t => {
  const server = startServer({ port: 0, host: "127.0.0.1" });
  if (!server.listening) await once(server, "listening");

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const queuedResponse = await fetch(
    `${base}/api/import/${providerName}/series-1`,
    { method: "POST" }
  );
  assert.equal(queuedResponse.status, 202);
  const queued = await queuedResponse.json();
  assert.equal(queued.status, "queued");
  assert.equal(queued.provider, providerName);
  assert.ok(queued.job_id);

  const duplicateResponse = await fetch(
    `${base}/api/import/${providerName}/series-1`,
    { method: "POST" }
  );
  assert.equal(duplicateResponse.status, 409);
  const duplicate = await duplicateResponse.json();
  assert.equal(duplicate.error, "IMPORT_ALREADY_RUNNING");
  assert.equal(duplicate.job_id, queued.job_id);

  const beforeWorker = await json(
    await fetch(`${base}/api/import/jobs/${queued.job_id}`)
  );
  assert.equal(beforeWorker.status, "queued");
  assert.equal(beforeWorker.completed, 0);

  const handled = await runOnce({
    jobs,
    workerId: "fixture-import-worker",
    role: "fixture-import-worker",
    types: ["import"],
    leaseMs: 30_000,
    handle: job => runImportJob(
      job.id,
      job.provider,
      job.provider_series_id,
      { delayMs: 0 }
    )
  });
  assert.equal(handled, true);

  const completed = await json(
    await fetch(`${base}/api/import/jobs/${queued.job_id}`)
  );
  assert.equal(completed.status, "completed");
  assert.equal(completed.progress, 100);
  assert.equal(completed.completed, 2);
  assert.equal(completed.failed, 0);
  assert.equal(completed.result.status, "completed");
  assert.equal(completed.result.episode_count, 2);

  const library = await json(await fetch(`${base}/api/library/series`));
  assert.equal(library.count, 1);
  assert.equal(library.items[0].provider, providerName);
  assert.equal(library.items[0].provider_series_id, "series-1");
  assert.equal(library.items[0].episode_count, 2);

  const seriesId = library.items[0].id;
  const episodes = await json(
    await fetch(`${base}/api/library/series/${seriesId}/episodes`)
  );
  assert.equal(episodes.count, 2);
  assert.deepEqual(
    episodes.episodes.map(item => item.episode_number),
    [1, 2]
  );
  assert.deepEqual(
    episodes.episodes.map(item => item.watch_option_count),
    [1, 1]
  );

  const persisted = {
    jobs: db.prepare("SELECT COUNT(*) AS count FROM runtime_jobs").get().count,
    series: db.prepare("SELECT COUNT(*) AS count FROM series").get().count,
    episodes: db.prepare("SELECT COUNT(*) AS count FROM episodes").get().count,
    watchOptions: db.prepare("SELECT COUNT(*) AS count FROM watch_options").get().count
  };
  assert.deepEqual(persisted, {
    jobs: 1,
    series: 1,
    episodes: 2,
    watchOptions: 2
  });

  const noSecondJob = await runOnce({
    jobs,
    workerId: "fixture-import-worker",
    role: "fixture-import-worker",
    types: ["import"],
    leaseMs: 30_000,
    handle: () => assert.fail("completed job must not be claimed twice")
  });
  assert.equal(noSecondJob, false);
});
