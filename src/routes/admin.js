const express = require("express");
const adminAuth = require("../middleware/admin-auth");
const metrics = require("../observability/metrics");
const logger = require("../observability/logger");
const { redactString } = require("../observability/redact");
const { createObservabilityRepository } = require("../repositories/observability-repository");
const { alertConfig, evaluateAlerts } = require("../observability/alerts");

function safeFailure(res, error) {
  logger.error("admin_read_failed", { error_code: error?.code || "ADMIN_STORAGE_UNAVAILABLE" });
  return res.status(503).json({ error: "ADMIN_STORAGE_UNAVAILABLE" });
}

function createAdminRouter(options = {}) {
  const router = express.Router();
  const repository = options.repository || createObservabilityRepository();

  router.use(adminAuth);

  router.get("/health/providers", async (req, res) => {
    try { res.json({ providers: await repository.providerHealth() }); }
    catch (error) { safeFailure(res, error); }
  });

  router.get("/circuits", async (req, res) => {
    try {
      const circuits = await repository.openCircuits();
      res.json({ circuits: circuits.map(item => ({
        ...item,
        last_failure_reason: redactString(String(item.last_failure_reason || "UNKNOWN"))
      })) });
    }
    catch (error) { safeFailure(res, error); }
  });

  router.get("/jobs", async (req, res) => {
    try { res.json({ jobs: await repository.recentJobs() }); }
    catch (error) { safeFailure(res, error); }
  });

  router.get("/playback", async (req, res) => {
    try { res.json(await repository.playbackSummary()); }
    catch (error) { safeFailure(res, error); }
  });

  router.get("/alerts", async (req, res) => {
    try {
      const circuits = await repository.openCircuits();
      res.json(evaluateAlerts({
        metricsSnapshot: metrics.snapshot(),
        openCircuits: circuits,
        config: alertConfig()
      }));
    } catch (error) { safeFailure(res, error); }
  });

  router.get("/metrics", (req, res) => res.json({ metrics: metrics.snapshot() }));
  router.get("/metrics.prom", (req, res) => res.type("text/plain; version=0.0.4").send(metrics.prometheus()));

  return router;
}

module.exports = createAdminRouter();
module.exports.createAdminRouter = createAdminRouter;
