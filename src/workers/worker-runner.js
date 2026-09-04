const os = require("node:os");
const jobs = require("../services/job-manager");

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function workerId(role) {
  return [
    role,
    os.hostname(),
    process.pid
  ].join(":");
}

async function runClaimedJob(job, options) {
  const store = options.jobs || jobs;
  const leaseMs = Number(options.leaseMs || 60000);
  const heartbeatMs = Math.max(1000, Math.floor(leaseMs / 3));

  const timer = setInterval(() => {
    store.heartbeat(job.id, options.workerId, leaseMs);
  }, heartbeatMs);

  timer.unref?.();

  try {
    await options.handle(job);
  } catch (error) {
    const current = store.get(job.id);

    if (current && current.attempts < current.max_attempts) {
      const retryDelay = Math.min(
        60000,
        1000 * (2 ** Math.max(0, current.attempts - 1))
      );

      store.requeue(job.id, options.workerId, retryDelay);
    } else {
      store.fail(job.id, error);
    }
  } finally {
    clearInterval(timer);
  }
}

async function runOnce(options) {
  const store = options.jobs || jobs;
  const job = store.claimNext(
    options.workerId,
    options.types,
    { leaseMs: options.leaseMs }
  );

  if (!job) return false;
  await runClaimedJob(job, { ...options, jobs: store });
  return true;
}

async function runWorker(options) {
  const id = options.workerId || workerId(options.role);
  const pollMs = Number(options.pollMs || 1000);
  const signal = options.signal;

  console.log(JSON.stringify({
    level: "info",
    event: "worker_started",
    role: options.role,
    worker_id: id
  }));

  while (!signal?.aborted) {
    const handled = await runOnce({ ...options, workerId: id });
    if (!handled) await delay(pollMs);
  }
}

module.exports = {
  workerId,
  runClaimedJob,
  runOnce,
  runWorker
};
