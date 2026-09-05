const express = require("express");
const path = require("node:path");
const { version: VERSION } = require("../package.json");
const { createDatabaseReadiness } = require("./db/readiness");
const { securityConfig } = require("./config/security");
const { httpServerConfig } = require("./config/http-server");
const {
  authentication,
  corsPolicy,
  errorEnvelope,
  errorHandler,
  inputGuard,
  rateLimiter,
  requestContext,
  validProviderTarget
} = require("./middleware/security");

const providers = require("./providers");
const jobs = require("./services/job-manager");
const { runImportJob } = require("./services/importer");
const {
  shouldExecuteJobsInline
} = require("./config/runtime-mode");

const libraryRouter = require("./routes/library");
const refreshRouter = require("./routes/refresh");
const refreshAllRouter = require("./routes/refresh-all");
const playRouter = require("./routes/play");
const clientHandoffRouter = require("./routes/client-handoff");
const searchRouter = require("./routes/search");
const resolveRouter = require("./routes/resolve");
const episodeResolveRouter = require("./routes/episode-resolve");
const canonicalRouter = require("./routes/canonical");
const playbackRouter = require("./routes/playback");
const downloadRouter = require("./routes/download");
const v1Router = require("./routes/v1");
const adminRouter = require("./routes/admin");
const observability = require("./middleware/observability");
const logger = require("./observability/logger");

const app = express();
const databaseReadiness = createDatabaseReadiness();

const runtimeState = {
  acceptingTraffic: false,
  shuttingDown: false,
  startedAt: null
};
const security = securityConfig();

function setWebAssetHeaders(res, filePath) {
  const name = path.basename(filePath);
  if (["index.html", "service-worker.js", "app.webmanifest"].includes(name)) {
    res.setHeader("Cache-Control", "no-cache");
  }
}

app.set("trust proxy", security.trustProxy);
app.disable("x-powered-by");
app.use(requestContext);
app.use(observability);
app.use(errorEnvelope);
app.use(corsPolicy(security));
app.use(express.static(path.join(process.cwd(), "web"), {
  extensions: ["html"],
  index: "index.html",
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  setHeaders: setWebAssetHeaders
}));
app.use(rateLimiter(security));
app.use(authentication(security));

const PORT =
  Number(process.env.PORT) || 3000;

app.use(
  express.json({
    limit: security.bodyLimit,
    strict: true
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: security.bodyLimit,
    parameterLimit: 50
  })
);
app.use(inputGuard(security));
app.use("/v1", v1Router);

app.get("/livez", (req, res) => {
  res.status(200).json({
    status: "alive",
    version: VERSION,
    uptime_seconds: Math.floor(process.uptime())
  });
});

app.get("/readyz", async (req, res) => {
  if (!runtimeState.acceptingTraffic || runtimeState.shuttingDown) {
    return res.status(503).json({
      status: "not_ready",
      reason: runtimeState.shuttingDown ? "SHUTTING_DOWN" : "STARTING"
    });
  }

  try {
    await databaseReadiness.check();
    return res.status(200).json({
      status: "ready",
      database: "reachable",
      database_driver: databaseReadiness.driver
    });
  } catch {
    return res.status(503).json({ status: "not_ready", reason: "DATABASE_UNAVAILABLE" });
  }
});

function normalizeProviderName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getProviderOrRespond(
  providerName,
  res
) {
  const name =
    normalizeProviderName(
      providerName
    );

  if (!providers.has(name)) {
    res.status(404).json({
      error: "UNKNOWN_PROVIDER",
      provider: name,
      available_providers:
        providers.list()
    });

    return null;
  }

  return providers.get(name);
}

async function queueImport(
  providerName,
  providerSeriesId,
  res
) {
  const provider =
    normalizeProviderName(
      providerName
    );

  const seriesId =
    String(
      providerSeriesId || ""
    ).trim();

  if (!provider) {
    return res.status(400).json({
      error:
        "PROVIDER_REQUIRED"
    });
  }

  if (!providers.has(provider)) {
    return res.status(400).json({
      error:
        "UNKNOWN_PROVIDER",

      provider,

      available_providers:
        providers.list()
    });
  }

  if (!seriesId) {
    return res.status(400).json({
      error:
        "SERIES_ID_REQUIRED",

      message:
        "Provide series_id in the request body, query string, or URL path."
    });
  }

  if (!validProviderTarget(providers.get(provider), seriesId)) {
    return res.status(400).json({ error: "INVALID_PROVIDER_TARGET" });
  }

  const dedupeKey = "import:" + provider + ":" + seriesId;
  const queued = await jobs.enqueueUnique({
    type: "import",
    provider,
    provider_series_id: seriesId,
    dedupe_key: dedupeKey
  });

  if (!queued.created) {
    const existing = queued.job;
    return res.status(409).json({
      error: "IMPORT_ALREADY_RUNNING",
      message: "An import for this series is already running.",
      job_id: existing.id,
      status: existing.status,
      progress_url: `/api/import/jobs/${existing.id}`
    });
  }

  const job = queued.job;

  if (shouldExecuteJobsInline()) {
    setImmediate(() => {
      runImportJob(
        job.id,
        provider,
        seriesId
      ).catch(error => {
        logger.error("import_job_failed", {
          job_id: job.id,
          provider,
          error_code: error.code || "IMPORT_FAILED"
        });
      });
    });
  }

  return res.status(202).json({
    message:
      "Import queued",

    job_id:
      job.id,

    status:
      job.status,

    provider,

    provider_series_id:
      seriesId,

    progress_url:
      `/api/import/jobs/${job.id}`
  });
}

/*
 * =========================================================
 * ROOT
 * =========================================================
 */

app.get(
  "/api",
  (req, res) => {
    res.json({
      name:
        "Theeb Engine",

      version:
        VERSION,

      status:
        "online",

      providers:
        providers.list(),

      endpoints: {
        play:
          "/play/:provider/:watchId/:episodeId?quality=720p",

        providers:
          "/api/providers",

        provider_series:
          "/api/providers/:provider/series/:id",

        provider_episode:
          "/api/providers/:provider/episode/:id",

        provider_watch:
          "/api/providers/:provider/watch/:watchId/:episodeId",

        import_path:
          "POST /api/import/:provider/:seriesId",

        import_body:
          "POST /api/import/:provider",

        jobs:
          "/api/import/jobs",

        library:
          "/api/library/series",

        live_search:
          "/api/search?q=...",

        resolve:
          "/api/resolve?q=...",

        resolve_episode:
          "/api/resolve/episode?q=...&season=1&episode=1",

        download_options:
          "/v1/episodes/:id/download-options",

        library_search:
          "/api/library/search?q=...",

        stats:
          "/api/library/stats",

        refresh:
          "POST /api/library/series/:id/refresh",

        refresh_all:
          "POST /api/library/refresh-all"
      }
    });
  }
);

/*
 * =========================================================
 * THEEB PLAY
 * =========================================================
 */

app.use(
  playRouter
);

/*
 * =========================================================
 * LIVE SEARCH
 * =========================================================
 */

app.use(
  "/api/search",
  searchRouter
);

/*
 * =========================================================
 * SERIES RESOLVER
 * =========================================================
 */

app.use(
  "/api/resolve",
  resolveRouter
);

app.use("/api/handoff", clientHandoffRouter);


/*
 * =========================================================
 * EPISODE RESOLVER
 * =========================================================
 */

app.use(
  "/api/resolve/episode",
  episodeResolveRouter
);

/*
 * =========================================================
 * PROVIDERS
 * =========================================================
 */

app.get(
  "/api/providers",
  (req, res) => {
    res.json({
      count:
        providers.list().length,

      providers:
        providers.list()
    });
  }
);

app.get(
  "/api/providers/details",
  (req, res) => {
    res.json({
      count:
        providers.list().length,

      providers:
        providers.describeAll()
    });
  }
);

/*
 * =========================================================
 * LIVE PROVIDER API
 * =========================================================
 */

app.get(
  "/api/providers/:provider/series/:id",
  async (req, res) => {
    const provider =
      getProviderOrRespond(
        req.params.provider,
        res
      );

    if (!provider) return;

    try {
      if (!validProviderTarget(provider, req.params.id)) {
        return res.status(400).json({ error: "INVALID_PROVIDER_TARGET" });
      }
      const result =
        await provider.getSeries(
          req.params.id
        );

      res.json(result);
    } catch (error) {
      logger.error("provider_series_failed", {
        request_id: req.requestId,
        provider: req.params.provider,
        error_code: error.code || "PROVIDER_SERIES_FAILED"
      });

      res.status(500).json({
        error:
          "PROVIDER_SERIES_FAILED",

        message: "تعذر إكمال الطلب بسبب خطأ داخلي. حاول مرة أخرى."
      });
    }
  }
);

app.get(
  "/api/providers/:provider/episode/:id",
  async (req, res) => {
    const provider =
      getProviderOrRespond(
        req.params.provider,
        res
      );

    if (!provider) return;

    try {
      if (!validProviderTarget(provider, req.params.id)) {
        return res.status(400).json({ error: "INVALID_PROVIDER_TARGET" });
      }
      const result =
        await provider.getEpisode(
          req.params.id
        );

      res.json(result);
    } catch (error) {
      logger.error("provider_episode_failed", {
        request_id: req.requestId,
        provider: req.params.provider,
        error_code: error.code || "PROVIDER_EPISODE_FAILED"
      });

      res.status(500).json({
        error:
          "PROVIDER_EPISODE_FAILED",

        message: "تعذر إكمال الطلب بسبب خطأ داخلي. حاول مرة أخرى."
      });
    }
  }
);

app.get(
  "/api/providers/:provider/watch/:watchId/:episodeId",
  async (req, res) => {
    const provider =
      getProviderOrRespond(
        req.params.provider,
        res
      );

    if (!provider) return;

    if (
      typeof provider.getWatchInfo !==
      "function"
    ) {
      return res.status(501).json({
        error:
          "WATCH_NOT_SUPPORTED",

        provider:
          req.params.provider
      });
    }

    try {
      if (
        !validProviderTarget(provider, req.params.watchId) ||
        !validProviderTarget(provider, req.params.episodeId)
      ) {
        return res.status(400).json({ error: "INVALID_PROVIDER_TARGET" });
      }

      const result =
        await provider.getWatchInfo(
          req.params.watchId,
          req.params.episodeId
        );

      res.json(result);
    } catch (error) {
      logger.error("provider_watch_failed", {
        request_id: req.requestId,
        provider: req.params.provider,
        error_code: error.code || "PROVIDER_WATCH_FAILED"
      });

      res.status(500).json({
        error:
          "PROVIDER_WATCH_FAILED",

        message: "تعذر إكمال الطلب بسبب خطأ داخلي. حاول مرة أخرى."
      });
    }
  }
);

/*
 * =========================================================
 * IMPORT
 *
 * Old:
 * POST /api/import/akwam/2758
 *
 * New:
 * POST /api/import/shahid4u
 * {
 *   "series_id": "https://..."
 * }
 *
 * Also supported:
 * POST /api/import/shahid4u?series_id=https://...
 * =========================================================
 */

app.post(
  "/api/import/:provider",
  async (req, res) => {
    const seriesId =
      req.body?.series_id ??
      req.body?.seriesId ??
      req.query?.series_id ??
      req.query?.seriesId;

    return queueImport(
      req.params.provider,
      seriesId,
      res
    );
  }
);

app.post(
  "/api/import/:provider/:seriesId",
  async (req, res) => {
    return queueImport(
      req.params.provider,
      req.params.seriesId,
      res
    );
  }
);

/*
 * =========================================================
 * JOBS
 * =========================================================
 */

app.get(
  "/api/import/jobs",
  async (req, res) => {
    const allJobs = await jobs.getAll();
    res.json({
      count: allJobs.length,
      jobs: allJobs
    });
  }
);

app.get(
  "/api/import/jobs/:jobId",
  async (req, res) => {
    const job =
      await jobs.get(
        req.params.jobId
      );

    if (!job) {
      return res.status(404).json({
        error:
          "JOB_NOT_FOUND"
      });
    }

    res.json(job);
  }
);

app.post(
  "/api/import/jobs/:jobId/cancel",
  async (req, res) => {
    const job = await jobs.requestCancel(
      req.params.jobId
    );

    if (!job) {
      return res.status(404).json({
        error: "JOB_NOT_FOUND"
      });
    }

    if (!["queued", "running", "cancelled"].includes(job.status)) {
      return res.status(409).json({
        error: "JOB_NOT_CANCELLABLE",
        status: job.status
      });
    }

    return res.status(202).json({
      message: "Cancellation requested",
      job
    });
  }
);

/*
 * =========================================================
 * LIBRARY
 * =========================================================
 */

app.use(
  "/api/canonical",
  canonicalRouter
);

app.use("/v1", downloadRouter);

app.use(
  "/api/playback",
  playbackRouter
);

app.use("/internal/admin", adminRouter);

app.use(
  "/api/library",
  libraryRouter
);

app.use(
  "/api/library",
  refreshRouter
);

app.use(
  "/api/library",
  refreshAllRouter
);

/*
 * =========================================================
 * 404
 * =========================================================
 */

app.use(
  (req, res) => {
    res.status(404).json({
      error:
        "NOT_FOUND",

      method:
        req.method,

      path:
        req.path
    });
  }
);

app.use(errorHandler);

/*
 * =========================================================
 * START
 * =========================================================
 */

function startServer(options = {}) {
  const port = Number(options.port ?? PORT);
  const host = options.host || "0.0.0.0";

  runtimeState.shuttingDown = false;
  runtimeState.acceptingTraffic = false;

  const server = app.listen(port, host, () => {
    runtimeState.acceptingTraffic = true;
    runtimeState.startedAt = new Date().toISOString();
    logger.info("server_started", {
      version: VERSION,
      role: process.env.THEEB_ROLE || "all",
      provider_count: providers.list().length
    });
  });

  const httpConfig = httpServerConfig(options.env || process.env);
  server.requestTimeout = httpConfig.requestTimeoutMs;
  server.headersTimeout = httpConfig.headersTimeoutMs;
  server.keepAliveTimeout = httpConfig.keepAliveTimeoutMs;
  server.maxRequestsPerSocket = httpConfig.maxRequestsPerSocket;

  server.stopAcceptingTraffic = () => {
    runtimeState.shuttingDown = true;
    runtimeState.acceptingTraffic = false;
  };

  return server;
}

module.exports = { app, runtimeState, setWebAssetHeaders, startServer };
