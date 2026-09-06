const express = require("express");
const {
  createV1ReadRepository
} = require("../repositories/v1-read-repository");
const defaultSessions = require("../services/playback-session-store");
const providers = require("../providers");
const defaultJobs = require("../services/job-manager");
const { runImportJob: defaultRunImportJob } = require("../services/importer");
const { baseTitle } = require("../services/search-orchestrator");
const { searchAll: defaultSearchAll } = require("../services/search-orchestrator");
const { shouldExecuteJobsInline } = require("../config/runtime-mode");
const { validProviderTarget } = require("../middleware/security");

const PUBLIC_ERROR_MESSAGES = Object.freeze({
  SEARCH_QUERY_REQUIRED: "A search query is required.",
  SEARCH_QUERY_TOO_LONG: "The search query is too long.",
  ID_INVALID: "The requested identifier is invalid.",
  CANONICAL_SERIES_NOT_FOUND: "The series was not found.",
  CANONICAL_EPISODE_NOT_FOUND: "The episode was not found.",
  PLAYBACK_SESSION_NOT_FOUND: "The playback session was not found.",
  PLAYBACK_SESSION_ID_INVALID: "The playback session identifier is invalid.",
  PLAYBACK_SESSION_NOT_ACTIVE: "The playback session is not active.",
  REQUEST_BODY_INVALID: "The request body must be a JSON object.",
  REQUEST_BODY_UNKNOWN_FIELD: "The request contains an unsupported field.",
  CLIENT_INVALID: "Client information is required.",
  CLIENT_UNKNOWN_FIELD: "Client information contains an unsupported field.",
  CLIENT_PLATFORM_INVALID: "The client platform is invalid.",
  CLIENT_VERSION_INVALID: "The client version is invalid.",
  QUALITY_INVALID: "The requested quality is invalid.",
  CANONICAL_EPISODE_ID_INVALID: "The episode identifier is invalid.",
  EVENT_ID_INVALID: "The event identifier is invalid.",
  EVENT_TYPE_INVALID: "The playback event type is invalid.",
  OCCURRED_AT_INVALID: "The playback event timestamp is invalid.",
  POSITION_INVALID: "The playback position is invalid.",
  ERROR_CODE_INVALID: "The playback error code is invalid.",
  EVENT_DETAILS_INVALID: "Playback event details must be a JSON object.",
  EVENT_DETAILS_UNKNOWN_FIELD: "Playback event details contain an unsupported field.",
  EVENT_DETAILS_TOO_LARGE: "Playback event details are too large.",
  FEEDBACK_RATE_LIMITED: "Too many playback feedback events were submitted.",
  DISCOVERY_QUERY_REQUIRED: "A discovery query is required.",
  DISCOVERY_QUERY_TOO_LONG: "The discovery query is too long.",
  DISCOVERY_PROVIDER_INVALID: "The selected provider is invalid.",
  DISCOVERY_TARGET_INVALID: "The selected provider target is invalid.",
  IMPORT_JOB_NOT_FOUND: "The import job was not found.",
  IMPORT_ALREADY_RUNNING: "An import for this item is already running."
});

function statusFor(code) {
  if (String(code).endsWith("_NOT_FOUND")) return 404;
  if (code === "PLAYBACK_SESSION_NOT_ACTIVE" || code === "IMPORT_ALREADY_RUNNING") return 409;
  if (code === "FEEDBACK_RATE_LIMITED") return 429;
  if (code === "IMPORT_JOB_NOT_FOUND") return 404;
  return 400;
}

function respondError(res, error) {
  const known = PUBLIC_ERROR_MESSAGES[error?.message];
  const code = known ? error.message : "INTERNAL_ERROR";

  return res.status(known ? statusFor(code) : 500).json({
    error: {
      code,
      message: PUBLIC_ERROR_MESSAGES[code] || "An internal error occurred."
    }
  });
}

function positiveId(value) {
  const text = String(value || "");
  if (!/^[1-9]\d*$/.test(text)) throw new Error("ID_INVALID");
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) throw new Error("ID_INVALID");
  return parsed;
}

function publicSeries(row) {
  return {
    id: row.id,
    title: row.title,
    original_title: row.original_title || null,
    description: row.description || null,
    image: row.image || null,
    content_type: row.content_type,
    language: row.language || null,
    country: row.country || null,
    year: row.year || null,
    status: row.status,
    episode_count: Number(row.episode_count || 0)
  };
}

function publicEpisode(row) {
  return {
    id: row.id,
    canonical_series_id: row.canonical_series_id,
    season_number: row.season_number,
    episode_number: row.episode_number,
    title: row.title || null,
    description: row.description || null,
    image: row.image || null,
    watch_available: Number(row.watch_count || 0) > 0,
    download_available: Number(row.download_count || 0) > 0
  };
}

function createV1Router(options = {}) {
  const repository =
    options.repository ||
    createV1ReadRepository(options.env || process.env);
  const sessions = options.sessions || defaultSessions;
  const jobs = options.jobs || defaultJobs;
  const searchAll = options.searchAll || defaultSearchAll;
  const runImportJob = options.runImportJob || defaultRunImportJob;
  const providerRegistry = options.providers || providers;
  const inlineJobs = options.inlineJobs ?? shouldExecuteJobsInline();
  const executeClientImports = options.executeClientImports ?? true;
  let activeClientImports = 0;
  const scheduledClientImports = new Set();
  const maxClientImports = Math.max(1, Math.min(2, Number(options.maxClientImports || process.env.CLIENT_IMPORT_CONCURRENCY || 1)));
  const router = express.Router();

  router.get("/search", async (req, res) => {
    const query = String(req.query.q || "").trim();
    if (!query) return respondError(res, new Error("SEARCH_QUERY_REQUIRED"));
    if (query.length > 200) return respondError(res, new Error("SEARCH_QUERY_TOO_LONG"));

    try {
      const items = (await repository.searchSeries(query)).map(publicSeries);
      return res.json({ data: { query, count: items.length, items } });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.get("/discover", async (req, res) => {
    const query = String(req.query.q || "").trim();
    if (!query) return respondError(res, new Error("DISCOVERY_QUERY_REQUIRED"));
    if (query.length > 200) return respondError(res, new Error("DISCOVERY_QUERY_TOO_LONG"));

    try {
      const result = await searchAll(query);
      const items = (result.results || []).map(item => ({
        provider: String(item.provider || item.search_provider || ""),
        provider_series_id: String(item.provider_series_id || ""),
        title: String(item.title || ""),
        display_title: baseTitle(item.title) || String(item.title || ""),
        source_url: item.source_url || null,
        image: item.image || item.poster || null,
        year: item.year ? String(item.year) : null,
        content_type: item.type === "movie" ? "movie" : "series",
        match_score: Number(item.match_score || 0),
        match_level: String(item.match_level || "weak")
      })).filter(item => item.provider && item.provider_series_id && item.title);

      return res.json({
        data: {
          query,
          count: items.length,
          searched_providers: Number(result.searched_providers || 0),
          successful_providers: Number(result.successful_providers || 0),
          failed_providers: Number(result.failed_providers || 0),
          items
        }
      });
    } catch {
      return res.status(503).json({
        error: {
          code: "DISCOVERY_UNAVAILABLE",
          message: "External discovery is temporarily unavailable."
        }
      });
    }
  });

  router.post("/imports", async (req, res) => {
    const providerName = String(req.body?.provider || "").trim().toLowerCase();
    const providerSeriesId = String(req.body?.provider_series_id || "").trim();

    if (!providerRegistry.has(providerName)) {
      return respondError(res, new Error("DISCOVERY_PROVIDER_INVALID"));
    }
    const provider = providerRegistry.get(providerName);
    if (!validProviderTarget(provider, providerSeriesId)) {
      return respondError(res, new Error("DISCOVERY_TARGET_INVALID"));
    }

    const dedupeKey = "import:" + providerName + ":" + providerSeriesId;
    const queued = await jobs.enqueueUnique({
      type: "import",
      provider: providerName,
      provider_series_id: providerSeriesId,
      dedupe_key: dedupeKey
    });

    const job = queued.job;

    if ((inlineJobs || executeClientImports) && !scheduledClientImports.has(job.id)) {
      scheduledClientImports.add(job.id);
      setImmediate(async () => {
        try {
          while (activeClientImports >= maxClientImports) {
            await new Promise(resolve => setTimeout(resolve, 250));
          }
          const current = await jobs.get(job.id);
          if (!current || current.status !== "queued") return;
          activeClientImports++;
          try {
            await runImportJob(job.id, providerName, providerSeriesId);
          } catch {
            // runImportJob persists terminal failure state.
          } finally {
            activeClientImports--;
          }
        } finally {
          scheduledClientImports.delete(job.id);
        }
      });
    }

    return res.status(202).json({
      data: {
        job_id: job.id,
        status: job.status,
        provider: providerName,
        provider_series_id: providerSeriesId,
        reused: !queued.created
      }
    });
  });

  router.post("/imports/:id/cancel", async (req, res) => {
    const job = await jobs.get(req.params.id);
    if (!job || job.type !== "import") {
      return respondError(res, new Error("IMPORT_JOB_NOT_FOUND"));
    }
    const cancelled = await jobs.requestCancel(req.params.id);
    return res.json({
      data: {
        job_id: cancelled.id,
        status: cancelled.status,
        progress: Number(cancelled.progress || 0)
      }
    });
  });

  router.get("/imports/:id", async (req, res) => {
    const job = await jobs.get(req.params.id);
    if (!job || job.type !== "import") {
      return respondError(res, new Error("IMPORT_JOB_NOT_FOUND"));
    }
    return res.json({
      data: {
        job_id: job.id,
        status: job.status,
        progress: Number(job.progress || 0),
        completed: Number(job.completed || 0),
        failed: Number(job.failed || 0),
        result: job.result || null
      }
    });
  });

  router.get("/series/:id", async (req, res) => {
    try {
      const id = positiveId(req.params.id);
      const item = await repository.getSeries(id);
      if (!item) throw new Error("CANONICAL_SERIES_NOT_FOUND");
      return res.json({ data: publicSeries(item) });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.get("/series/:id/episodes", async (req, res) => {
    try {
      const id = positiveId(req.params.id);
      const rows = await repository.listEpisodes(id);
      if (!rows) throw new Error("CANONICAL_SERIES_NOT_FOUND");
      const items = rows.map(publicEpisode);

      return res.json({ data: { count: items.length, items } });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.get("/episodes/:id", async (req, res) => {
    try {
      const id = positiveId(req.params.id);
      const item = await repository.getEpisode(id);
      if (!item) throw new Error("CANONICAL_EPISODE_NOT_FOUND");
      return res.json({ data: publicEpisode(item) });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.post("/playback/sessions", async (req, res) => {
    try {
      return res.status(201).json({ data: await sessions.createSession(req.body) });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.get("/playback/sessions/:id", async (req, res) => {
    try {
      const session = await sessions.getSession(req.params.id);
      if (!session) throw new Error("PLAYBACK_SESSION_NOT_FOUND");
      return res.json({ data: session });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.get("/playback/sessions/:id/media", async (req, res) => {
    try {
      const handoff = await sessions.mediaHandoff(req.params.id);
      return res.redirect(307, handoff.uri);
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.post("/playback/sessions/:id/feedback", async (req, res) => {
    try {
      return res.status(202).json({
        data: await sessions.recordFeedback(req.params.id, req.body)
      });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.get("/episodes/:id/download-options", async (req, res) => {
    try {
      return res.json({ data: await sessions.downloadOptions(positiveId(req.params.id)) });
    } catch (error) {
      return respondError(res, error);
    }
  });

  return router;
}

module.exports = createV1Router();
module.exports.createV1Router = createV1Router;
module.exports.PUBLIC_ERROR_MESSAGES = PUBLIC_ERROR_MESSAGES;
