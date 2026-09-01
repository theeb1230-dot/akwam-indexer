const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PostgresObservabilityRepository,
  SqliteObservabilityRepository
} = require("../src/repositories/observability-repository");

test("SQLite observability uses the injected storage boundary", async () => {
  const queries = [];
  const db = {
    prepare(sql) {
      queries.push(sql);
      return { all: () => [{ ok: 1 }] };
    }
  };
  const repository = new SqliteObservabilityRepository(db);
  assert.deepEqual(await repository.providerHealth(), [{ ok: 1 }]);
  assert.deepEqual(await repository.playbackSummary(), {
    sessions: [{ ok: 1 }], events: [{ ok: 1 }]
  });
  assert.ok(queries.some(sql => /playback_sessions/.test(sql)));
  assert.ok(queries.some(sql => /playback_session_events/.test(sql)));
});

test("PostgreSQL observability uses async pool queries", async () => {
  const queries = [];
  const repository = new PostgresObservabilityRepository({
    async query(sql) {
      queries.push(sql);
      return { rows: [{ backend: "postgres" }] };
    }
  });
  assert.deepEqual(await repository.recentJobs(), [{ backend: "postgres" }]);
  assert.deepEqual(await repository.playbackSummary(), {
    sessions: [{ backend: "postgres" }],
    events: [{ backend: "postgres" }]
  });
  assert.ok(queries.every(sql => !sql.includes("?")));
});

test("job observability excludes provider locators and job payloads", async () => {
  const queries = [];
  const repository = new PostgresObservabilityRepository({
    async query(sql) {
      queries.push(sql);
      return { rows: [] };
    }
  });

  await repository.recentJobs();
  assert.equal(queries.length, 1);
  assert.doesNotMatch(
    queries[0],
    /provider_series_id|current_item|payload|result|errors/i
  );
});
