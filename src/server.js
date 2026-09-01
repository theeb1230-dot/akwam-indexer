const express = require("express");
const { version: VERSION } = require("../package.json");
const db = require("./db/schema");

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

const app = express();

const runtimeState = {
  acceptingTraffic: false,
  shuttingDown: false,
  startedAt: null
};

const PORT =
  Number(process.env.PORT) || 3000;

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

app.get("/livez", (req, res) => {
  res.status(200).json({
    status: "alive",
    version: VERSION,
    uptime_seconds: Math.floor(process.uptime())
  });
});

app.get("/readyz", (req, res) => {
  if (!runtimeState.acceptingTraffic || runtimeState.shuttingDown) {
    return res.status(503).json({
      status: "not_ready",
      reason: runtimeState.shuttingDown ? "SHUTTING_DOWN" : "STARTING"
    });
  }

  try {
    db.prepare("SELECT 1 AS ok").get();
    return res.status(200).json({ status: "ready", database: "reachable" });
  } catch (error) {
    return res.status(503).json({
      status: "not_ready",
      reason: "DATABASE_UNAVAILABLE"
    });
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

function getRunningImport(
  provider,
  providerSeriesId
) {
  const target =
    String(providerSeriesId);

  return jobs
    .getAll()
    .find(job => {
      return (
        job.type === "import" &&
        job.provider === provider &&
        String(
          job.provider_series_id
        ) === target &&
        (
          job.status === "queued" ||
          job.status === "running"
        )
      );
    });
}

function queueImport(
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

  const existing =
    getRunningImport(
      provider,
      seriesId
    );

  if (existing) {
    return res.status(409).json({
      error:
        "IMPORT_ALREADY_RUNNING",

      message:
        "An import for this series is already running.",

      job_id:
        existing.id,

      status:
        existing.status,

      progress_url:
        `/api/import/jobs/${existing.id}`
    });
  }

  const job =
    jobs.create({
      type: "import",
      provider,
      provider_series_id:
        seriesId
    });

  if (shouldExecuteJobsInline()) {
    setImmediate(() => {
      runImportJob(
        job.id,
        provider,
        seriesId
      ).catch(error => {
        console.error(
          `[IMPORT ${job.id}]`,
          error.message
        );
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
  "/",
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
      const result =
        await provider.getSeries(
          req.params.id
        );

      res.json(result);
    } catch (error) {
      console.error(
        "Provider series error:",
        error
      );

      res.status(500).json({
        error:
          "PROVIDER_SERIES_FAILED",

        message:
          error.message
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
      const result =
        await provider.getEpisode(
          req.params.id
        );

      res.json(result);
    } catch (error) {
      console.error(
        "Provider episode error:",
        error
      );

      res.status(500).json({
        error:
          "PROVIDER_EPISODE_FAILED",

        message:
          error.message
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
      const result =
        await provider.getWatchInfo(
          req.params.watchId,
          req.params.episodeId
        );

      res.json(result);
    } catch (error) {
      console.error(
        "Provider watch error:",
        error
      );

      res.status(500).json({
        error:
          "PROVIDER_WATCH_FAILED",

        message:
          error.message
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
  (req, res) => {
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
  (req, res) => {
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
  (req, res) => {
    res.json({
      count:
        jobs.getAll().length,

      jobs:
        jobs.getAll()
    });
  }
);

app.get(
  "/api/import/jobs/:jobId",
  (req, res) => {
    const job =
      jobs.get(
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
  (req, res) => {
    const job = jobs.requestCancel(
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

app.use(
  "/api/playback",
  playbackRouter
);

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
        req.originalUrl
    });
  }
);

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
    console.log("");
    console.log(
      `🐺 THEEB ENGINE v${VERSION}`
    );
    console.log(
      `🚀 http://localhost:${port}`
    );
    console.log(
      `🔌 Providers: ${providers.list().join(", ")}`
    );
    console.log(
      "▶️ Theeb Play ready"
    );
    console.log(
      "📚 Library API ready"
    );
    console.log(
      "🔎 Search ready"
    );
    console.log(
      "📊 Stats ready"
    );
    console.log(
      "⚙️ Background Import ready"
    );
    console.log(
      "🔄 Series Refresh ready"
    );
    console.log(
      "🔁 Refresh All ready"
    );
    console.log(
      "🧩 URL/Slug imports ready"
    );
    console.log("");
  });

  server.stopAcceptingTraffic = () => {
    runtimeState.shuttingDown = true;
    runtimeState.acceptingTraffic = false;
  };

  return server;
}

module.exports = {
  app,
  runtimeState,
  startServer
};
