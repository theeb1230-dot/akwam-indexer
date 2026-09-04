const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PostgresEpisodeHealthRepository
} = require("../src/repositories/episode-health-repository");
const {
  dueEpisodes
} = require("../src/services/health-scheduler");
const {
  storeEpisodeHealth
} = require("../src/workers/health-worker");

function fakePool() {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT\s+ce\.id AS canonical_episode_id/.test(sql)) {
        return {
          rows: [{
            canonical_episode_id: "101",
            title: "Fixture",
            canonical_key: "provider:fixture:s1",
            season_number: "1",
            episode_number: "2"
          }]
        };
      }
      return { rows: [], rowCount: 1 };
    }
  };
}

test("PostgreSQL health repository returns due episodes with numeric ids", async () => {
  const pool = fakePool();
  const repository = new PostgresEpisodeHealthRepository(pool);
  const rows = await repository.dueEpisodes({
    now: "2026-09-04T19:00:00.000Z",
    limit: 25
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].canonical_episode_id, 101);
  assert.equal(rows[0].season_number, 1);
  assert.equal(rows[0].episode_number, 2);
  assert.match(pool.calls[0].sql, /LEFT JOIN episode_health_schedule/);
  assert.deepEqual(pool.calls[0].values, ["2026-09-04T19:00:00.000Z", 25]);
});

test("health scheduler awaits injected repository contract", async () => {
  const calls = [];
  const repository = {
    async dueEpisodes(input) {
      calls.push(input);
      return [{
        canonical_episode_id: 7,
        title: "Fixture",
        canonical_key: "fixture-key",
        season_number: 1,
        episode_number: 3
      }];
    }
  };

  const rows = await dueEpisodes({
    now: new Date("2026-09-04T20:00:00.000Z"),
    limit: 10,
    repository
  });

  assert.equal(rows[0].canonical_episode_id, 7);
  assert.equal(calls[0].limit, 10);
  assert.equal(calls[0].now, "2026-09-04T20:00:00.000Z");
});

test("health worker persists schedule through repository without SQLite", async () => {
  const calls = [];
  const repository = {
    async storeEpisodeHealth(input) {
      calls.push(input);
    }
  };
  const job = {
    id: "00000000-0000-4000-8000-000000000123",
    payload: { canonical_episode_id: 88 }
  };

  await storeEpisodeHealth(job, "PLAYBACK_VERIFIED", {
    repository,
    healthyTtlMs: 600000
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].episodeId, 88);
  assert.equal(calls[0].status, "PLAYBACK_VERIFIED");
  assert.equal(calls[0].jobId, job.id);
  assert.match(calls[0].nextCheckAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("PostgreSQL health repository upserts schedule state", async () => {
  const pool = fakePool();
  const repository = new PostgresEpisodeHealthRepository(pool);
  await repository.storeEpisodeHealth({
    episodeId: 12,
    status: "TEMPORARILY_FAILED",
    nextCheckAt: "2026-09-04T20:02:00.000Z",
    jobId: "00000000-0000-4000-8000-000000000456"
  });

  const call = pool.calls[0];
  assert.match(call.sql, /INSERT INTO episode_health_schedule/);
  assert.match(call.sql, /ON CONFLICT\(canonical_episode_id\)/);
  assert.deepEqual(call.values, [
    12,
    "TEMPORARILY_FAILED",
    "2026-09-04T20:02:00.000Z",
    "00000000-0000-4000-8000-000000000456"
  ]);
});
