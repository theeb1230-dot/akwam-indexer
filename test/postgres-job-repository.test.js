const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PostgresJobRepository
} = require("../src/repositories/postgres-job-repository");

function fakePool(responses = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return responses.shift() || { rows: [], rowCount: 0 };
    }
  };
}

test("PostgreSQL claims jobs with SKIP LOCKED", async () => {
  const pool = fakePool([{ rows: [{ id: "job-1" }], rowCount: 1 }]);
  const repository = new PostgresJobRepository(pool);
  const job = await repository.claimNext(
    "worker-a",
    ["refresh"],
    { now: new Date("2026-08-31T00:00:00Z"), leaseMs: 5000 }
  );

  assert.equal(job.id, "job-1");
  assert.match(pool.calls[0].sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(pool.calls[0].sql, /cancel_requested = FALSE/);
  assert.deepEqual(pool.calls[0].params[1], ["refresh"]);
});

test("PostgreSQL active dedupe uses the partial constraint", async () => {
  const pool = fakePool([
    { rows: [], rowCount: 0 },
    { rows: [{ id: "existing" }], rowCount: 1 }
  ]);
  const repository = new PostgresJobRepository(pool);
  const result = await repository.enqueueUnique({
    type: "health-check",
    dedupe_key: "health:episode:1"
  });

  assert.equal(result.created, false);
  assert.equal(result.job.id, "existing");
  assert.match(pool.calls[0].sql, /ON CONFLICT \(dedupe_key\)/);
});
