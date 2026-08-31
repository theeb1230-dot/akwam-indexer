const test = require("node:test");
const assert = require("node:assert/strict");
const {
  runOnce,
  runClaimedJob
} = require("../src/workers/worker-runner");

function fakeStore(job) {
  const calls = [];
  let current = job;

  return {
    calls,
    claimNext() {
      const claimed = current;
      current = null;
      return claimed;
    },
    heartbeat() {
      calls.push("heartbeat");
      return true;
    },
    get() {
      return job;
    },
    requeue(id, owner, delay) {
      calls.push(["requeue", id, owner, delay]);
      return true;
    },
    fail(id, error) {
      calls.push(["fail", id, error.message]);
    }
  };
}

test("worker handles one claimed job", async () => {
  const store = fakeStore({
    id: "job-1",
    attempts: 1,
    max_attempts: 3
  });
  const handled = [];

  const result = await runOnce({
    jobs: store,
    workerId: "worker-a",
    types: ["refresh"],
    async handle(job) {
      handled.push(job.id);
    }
  });

  assert.equal(result, true);
  assert.deepEqual(handled, ["job-1"]);
});

test("retryable worker failure is requeued with backoff", async () => {
  const job = {
    id: "job-retry",
    attempts: 1,
    max_attempts: 3
  };
  const store = fakeStore(job);

  await runClaimedJob(job, {
    jobs: store,
    workerId: "worker-a",
    leaseMs: 3000,
    async handle() {
      throw new Error("temporary");
    }
  });

  assert.equal(store.calls[0][0], "requeue");
  assert.equal(store.calls[0][3], 1000);
});

test("exhausted worker failure becomes terminal", async () => {
  const job = {
    id: "job-dead",
    attempts: 3,
    max_attempts: 3
  };
  const store = fakeStore(job);

  await runClaimedJob(job, {
    jobs: store,
    workerId: "worker-a",
    async handle() {
      throw new Error("terminal");
    }
  });

  assert.deepEqual(
    store.calls[0],
    ["fail", "job-dead", "terminal"]
  );
});
