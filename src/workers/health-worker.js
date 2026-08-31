const db = require("../db/schema");
const jobs = require("../services/job-manager");
const {
  executePlayback
} = require("../services/playback-executor");
const {
  recordVerification
} = require("../services/playback-verification-store");
const {
  probe
} = require("../../scripts/wecima-browser-probe");
const {
  enqueueDueHealthJobs
} = require("../services/health-scheduler");
const {
  runWorker
} = require("./worker-runner");

function nextCheck(status, options = {}) {
  const healthyMs = Number(options.healthyTtlMs || process.env.HEALTH_TTL_MS || 600000);
  const failedMs = Number(options.failedTtlMs || process.env.HEALTH_FAILURE_TTL_MS || 120000);
  return new Date(Date.now() + (
    status === "PLAYBACK_VERIFIED" ? healthyMs : failedMs
  )).toISOString();
}

function safeCandidate(candidate) {
  if (!candidate) return null;
  return {
    provider: candidate.provider,
    episode_id: candidate.episode_id,
    watch_id: candidate.watch_id,
    server: candidate.server || null,
    type: candidate.type,
    quality: candidate.quality || null,
    fallback_order: candidate.fallback_order || null
  };
}

function storeEpisodeHealth(job, status, options = {}) {
  const episodeId = Number(job.payload.canonical_episode_id);
  const failed = status === "PLAYBACK_VERIFIED" ? 0 : 1;

  db.prepare(`
    INSERT INTO episode_health_schedule (
      canonical_episode_id, last_status, last_checked_at,
      next_check_at, last_job_id, consecutive_failures, updated_at
    ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(canonical_episode_id)
    DO UPDATE SET
      last_status = excluded.last_status,
      last_checked_at = CURRENT_TIMESTAMP,
      next_check_at = excluded.next_check_at,
      last_job_id = excluded.last_job_id,
      consecutive_failures = CASE
        WHEN excluded.last_status = 'PLAYBACK_VERIFIED' THEN 0
        ELSE episode_health_schedule.consecutive_failures + 1
      END,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    episodeId,
    status,
    nextCheck(status, options),
    job.id,
    failed
  );
}

async function executeHealthCheck(job, options = {}) {
  const executor = options.executePlayback || executePlayback;
  const browserProbe = options.probe || probe;
  const verificationStore = options.recordVerification || recordVerification;

  if (jobs.isCancellationRequested(job.id)) {
    jobs.cancel(job.id, { status: "cancelled" });
    return { status: "cancelled" };
  }

  const result = await executor({
    query: job.payload.query,
    groupKey: job.payload.group_key,
    season: job.payload.season,
    episode: job.payload.episode
  });

  let status = result.status === "ready"
    ? "PLAYBACK_VERIFIED"
    : "TEMPORARILY_FAILED";
  let browser = null;
  const selected = result.selected_source;

  if (jobs.isCancellationRequested(job.id)) {
    jobs.cancel(job.id, { status: "cancelled" });
    return { status: "cancelled", result };
  }

  if (selected?.type === "embed") {
    if (!selected.embed_url) {
      status = "REACHABLE";
    } else {
      browser = await browserProbe(selected.embed_url, {
        timeoutMs: Number(process.env.BROWSER_PROBE_TIMEOUT_MS || 30000)
      });
      const stored = verificationStore(selected, browser);
      status = stored.health_state;
    }
  }

  storeEpisodeHealth(job, status, options);
  jobs.complete(job.id, {
    status,
    selected_source: safeCandidate(selected),
    attempts: result.attempts || [],
    browser
  });

  return { status, result, browser };
}

function startHealthWorker(options = {}) {
  const schedulerMs = Number(process.env.HEALTH_SCHEDULER_MS || 30000);
  const timer = setInterval(() => {
    try {
      enqueueDueHealthJobs();
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "health_schedule_failed",
        error: error.message
      }));
    }
  }, schedulerMs);

  timer.unref?.();
  enqueueDueHealthJobs();

  return runWorker({
    role: "health-worker",
    types: ["health-check"],
    handle: job => executeHealthCheck(job, options),
    leaseMs: Number(process.env.JOB_LEASE_MS || 60000),
    pollMs: Number(process.env.JOB_POLL_MS || 1000),
    ...options
  }).finally(() => clearInterval(timer));
}

module.exports = {
  nextCheck,
  safeCandidate,
  storeEpisodeHealth,
  executeHealthCheck,
  startHealthWorker
};
