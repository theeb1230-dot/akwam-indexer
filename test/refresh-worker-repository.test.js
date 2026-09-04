const test = require("node:test");
const assert = require("node:assert/strict");
const {
  refreshAll
} = require("../src/workers/refresh-worker");

test("refresh-all uses repository contract and importer without direct SQLite", async () => {
  const events = [];
  const repository = {
    async listAllSeries() {
      return [
        { id: 11, provider: "fixture", provider_series_id: "s11", title: "One" },
        { id: 12, provider: "fixture", provider_series_id: "s12", title: "Two" }
      ];
    }
  };
  const jobs = {
    async start(id, total) { events.push(["start", id, total]); },
    async setCurrentEpisode(id, item) { events.push(["current", id, item.library_series_id]); },
    async episodeCompleted(id) { events.push(["completed", id]); },
    async episodeFailed(id, error) { events.push(["failed", id, error]); },
    async complete(id, result) { events.push(["done", id, result]); }
  };
  const imports = [];
  const importSeries = async (provider, providerSeriesId) => {
    imports.push([provider, providerSeriesId]);
    return { provider, provider_series_id: providerSeriesId, status: "completed" };
  };

  await refreshAll({ id: "job-1" }, {
    repository,
    jobs,
    importSeries
  });

  assert.deepEqual(imports, [
    ["fixture", "s11"],
    ["fixture", "s12"]
  ]);
  assert.deepEqual(events[0], ["start", "job-1", 2]);
  assert.equal(events.filter(event => event[0] === "completed").length, 2);
  const done = events.find(event => event[0] === "done");
  assert.equal(done[2].series_count, 2);
  assert.equal(done[2].results.length, 2);
});

test("refresh-all records one series failure and continues", async () => {
  const failures = [];
  const repository = {
    async listAllSeries() {
      return [
        { id: 21, provider: "fixture", provider_series_id: "bad", title: "Bad" },
        { id: 22, provider: "fixture", provider_series_id: "good", title: "Good" }
      ];
    }
  };
  const jobs = {
    async start() {},
    async setCurrentEpisode() {},
    async episodeCompleted() {},
    async episodeFailed(id, error) { failures.push(error); },
    async complete() {}
  };
  const importSeries = async (_provider, providerSeriesId) => {
    if (providerSeriesId === "bad") throw new Error("fixture failure");
    return { status: "completed" };
  };

  await refreshAll({ id: "job-2" }, {
    repository,
    jobs,
    importSeries
  });

  assert.equal(failures.length, 1);
  assert.equal(failures[0].library_series_id, 21);
  assert.equal(failures[0].message, "fixture failure");
});
