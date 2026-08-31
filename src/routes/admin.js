const express = require("express");
const db = require("../db/schema");
const adminAuth = require("../middleware/admin-auth");
const metrics = require("../observability/metrics");
const router = express.Router();

router.use(adminAuth);

router.get("/health/providers", (req, res) => {
  const providers = db.prepare(`SELECT provider,
    COUNT(*) AS candidates, SUM(success_count) AS successes,
    SUM(failure_count) AS failures, ROUND(AVG(avg_latency_ms)) AS avg_latency_ms,
    MAX(updated_at) AS last_updated_at
    FROM playback_health GROUP BY provider ORDER BY provider`).all();
  res.json({ providers });
});

router.get("/circuits", (req, res) => {
  const circuits = db.prepare(`SELECT provider, server, playback_type,
    consecutive_failures, last_failure_reason, circuit_open_until, updated_at
    FROM playback_health WHERE circuit_open_until > CURRENT_TIMESTAMP
    ORDER BY circuit_open_until DESC LIMIT 200`).all();
  res.json({ circuits });
});

router.get("/jobs", (req, res) => {
  const jobs = db.prepare(`SELECT id, type, provider, provider_series_id, status,
    total, completed, failed, progress, attempts, max_attempts, worker_id,
    lease_expires_at, available_at, created_at, started_at, finished_at, updated_at
    FROM runtime_jobs ORDER BY created_at DESC LIMIT 200`).all();
  res.json({ jobs });
});

router.get("/playback", (req, res) => {
  const aggregate = db.prepare(`SELECT status, COUNT(*) AS sessions,
    ROUND(AVG(first_frame_ms)) AS avg_first_frame_ms,
    SUM(buffering_count) AS buffering_events, SUM(stalled_count) AS stalled_events
    FROM playback_sessions GROUP BY status`).all();
  res.json({ aggregate });
});

router.get("/metrics", (req, res) => res.json({ metrics: metrics.snapshot() }));
router.get("/metrics.prom", (req, res) => res.type("text/plain; version=0.0.4").send(metrics.prometheus()));

module.exports = router;
