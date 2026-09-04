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


test("PostgreSQL lifecycle supports progress, retry, cancellation and terminal states", async () => {
  const row = {
    id: "job-2",
    type: "refresh",
    status: "running",
    total: 2,
    completed: 1,
    failed: 0,
    progress: 50,
    current_item: null,
    result: null,
    errors: [],
    payload: { reason: "scheduled" },
    cancel_requested: false,
    attempts: 1,
    max_attempts: 3
  };
  const pool = fakePool([
    { rows: [{ ...row, completed: 2, progress: 100 }], rowCount: 1 },
    { rows: [{ id: "job-2" }], rowCount: 1 },
    { rows: [{ ...row, cancel_requested: true }], rowCount: 1 },
    { rows: [{ ...row, status: "cancelled", cancel_requested: true, result: { reason: "user" } }], rowCount: 1 }
  ]);
  const repository = new PostgresJobRepository(pool);

  const progressed = await repository.episodeCompleted("job-2");
  assert.equal(progressed.completed, 2);
  assert.equal(progressed.progress, 100);

  assert.equal(await repository.requeue("job-2", "worker-a", 1000), true);

  const requested = await repository.requestCancel("job-2");
  assert.equal(requested.cancel_requested, true);

  const cancelled = await repository.cancel("job-2", { reason: "user" });
  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual(cancelled.result, { reason: "user" });

  assert.match(pool.calls[1].sql, /available_at = NOW\(\) \+ \(\$3 \* INTERVAL '1 millisecond'\)/);
  assert.match(pool.calls[3].sql, /status = 'cancelled'/);
});
