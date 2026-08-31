const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `theeb-jobs-${process.pid}.sqlite`
);

const jobs = require("../src/services/job-manager");

test("queued jobs are durable database records", () => {
  const created = jobs.create({
    type: "refresh",
    provider: "fixture",
    provider_series_id: "series-1",
    payload: { reason: "scheduled" }
  });

  const stored = jobs.get(created.id);
  assert.equal(stored.status, "queued");
  assert.equal(stored.provider_series_id, "series-1");
  assert.deepEqual(stored.payload, { reason: "scheduled" });
});

test("only one worker can claim a queued job", () => {
  const created = jobs.create({ type: "import" });
  const first = jobs.claimNext("worker-a", ["import"]);
  const second = jobs.claimNext("worker-b", ["import"]);

  assert.equal(first.id, created.id);
  assert.equal(first.worker_id, "worker-a");
  assert.equal(second, null);
});

test("an expired lease can be recovered by another worker", () => {
  const created = jobs.create({ type: "lease-recovery" });
  const now = new Date("2099-08-31T00:00:00.000Z");

  jobs.claimNext(
    "dead-worker",
    ["lease-recovery"],
    { now, leaseMs: 1000 }
  );

  const recovered = jobs.claimNext(
    "replacement-worker",
    ["lease-recovery"],
    {
      now: new Date("2099-08-31T00:00:02.000Z"),
      leaseMs: 1000
    }
  );

  assert.equal(recovered.id, created.id);
  assert.equal(recovered.worker_id, "replacement-worker");
  assert.equal(recovered.attempts, 2);
});

test("only the lease owner may heartbeat or requeue", () => {
  const created = jobs.create({ type: "ownership" });
  jobs.claimNext("owner", ["ownership"]);

  assert.equal(jobs.heartbeat(created.id, "intruder"), false);
  assert.equal(jobs.requeue(created.id, "intruder"), false);
  assert.equal(jobs.heartbeat(created.id, "owner"), true);
  assert.equal(jobs.requeue(created.id, "owner"), true);
  assert.equal(jobs.get(created.id).status, "queued");
});

test("active dedupe keys produce one job", () => {
  const first = jobs.enqueueUnique({
    type: "health-check",
    dedupe_key: "health:fixture:1"
  });
  const second = jobs.enqueueUnique({
    type: "health-check",
    dedupe_key: "health:fixture:1"
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.job.id, first.job.id);
});

test("queued jobs cancel immediately and cannot be claimed", () => {
  const created = jobs.create({ type: "cancel-fixture" });
  const cancelled = jobs.requestCancel(created.id);

  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancel_requested, true);
  assert.equal(
    jobs.claimNext("worker", ["cancel-fixture"]),
    null
  );
});
