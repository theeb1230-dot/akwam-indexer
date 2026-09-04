const express = require("express");
const defaultDb = require("../db/schema");
const defaultSessions = require("../services/playback-session-store");

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
  FEEDBACK_RATE_LIMITED: "Too many playback feedback events were submitted."
});

function statusFor(code) {
  if (String(code).endsWith("_NOT_FOUND")) return 404;
  if (code === "PLAYBACK_SESSION_NOT_ACTIVE") return 409;
  if (code === "FEEDBACK_RATE_LIMITED") return 429;
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
  const db = options.db || defaultDb;
  const sessions = options.sessions || defaultSessions;
  const router = express.Router();

  router.get("/search", (req, res) => {
    const query = String(req.query.q || "").trim();
    if (!query) return respondError(res, new Error("SEARCH_QUERY_REQUIRED"));
    if (query.length > 200) return respondError(res, new Error("SEARCH_QUERY_TOO_LONG"));

    const pattern = `%${query.replace(/[\\%_]/g, value => `\\${value}`)}%`;
    const items = db.prepare(`
      SELECT cs.id, cs.title, cs.original_title, cs.description, cs.image,
        cs.content_type, cs.language, cs.country, cs.year, cs.status,
        COUNT(DISTINCT ce.id) AS episode_count
      FROM canonical_series cs
      LEFT JOIN canonical_episodes ce ON ce.canonical_series_id = cs.id
      WHERE cs.status != 'deleted'
        AND (cs.title LIKE ? ESCAPE '\\' OR cs.original_title LIKE ? ESCAPE '\\')
      GROUP BY cs.id
      ORDER BY CASE WHEN lower(cs.title) = lower(?) THEN 0 ELSE 1 END,
        cs.updated_at DESC, cs.id
      LIMIT 50
    `).all(pattern, pattern, query).map(publicSeries);

    return res.json({ data: { query, count: items.length, items } });
  });

  router.get("/series/:id", (req, res) => {
    try {
      const id = positiveId(req.params.id);
      const item = db.prepare(`
        SELECT cs.id, cs.title, cs.original_title, cs.description, cs.image,
          cs.content_type, cs.language, cs.country, cs.year, cs.status,
          COUNT(DISTINCT ce.id) AS episode_count
        FROM canonical_series cs
        LEFT JOIN canonical_episodes ce ON ce.canonical_series_id = cs.id
        WHERE cs.id = ? AND cs.status != 'deleted'
        GROUP BY cs.id
      `).get(id);
      if (!item) throw new Error("CANONICAL_SERIES_NOT_FOUND");
      return res.json({ data: publicSeries(item) });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.get("/series/:id/episodes", (req, res) => {
    try {
      const id = positiveId(req.params.id);
      const series = db.prepare(
        "SELECT id FROM canonical_series WHERE id = ? AND status != 'deleted'"
      ).get(id);
      if (!series) throw new Error("CANONICAL_SERIES_NOT_FOUND");

      const items = db.prepare(`
        SELECT ce.id, ce.canonical_series_id, ce.season_number,
          ce.episode_number, ce.title, ce.description, ce.image,
          COUNT(DISTINCT CASE WHEN po.can_watch = 1 AND po.status = 'active' THEN po.id END) AS watch_count,
          COUNT(DISTINCT CASE WHEN po.can_download = 1 AND po.status = 'active' THEN po.id END) AS download_count
        FROM canonical_episodes ce
        LEFT JOIN provider_episodes pe
          ON pe.canonical_episode_id = ce.id AND pe.active = 1
        LEFT JOIN playback_options po ON po.provider_episode_id = pe.id
        WHERE ce.canonical_series_id = ?
        GROUP BY ce.id
        ORDER BY ce.season_number, ce.episode_number, ce.id
      `).all(id).map(publicEpisode);

      return res.json({ data: { count: items.length, items } });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.get("/episodes/:id", (req, res) => {
    try {
      const id = positiveId(req.params.id);
      const item = db.prepare(`
        SELECT ce.id, ce.canonical_series_id, ce.season_number,
          ce.episode_number, ce.title, ce.description, ce.image,
          COUNT(DISTINCT CASE WHEN po.can_watch = 1 AND po.status = 'active' THEN po.id END) AS watch_count,
          COUNT(DISTINCT CASE WHEN po.can_download = 1 AND po.status = 'active' THEN po.id END) AS download_count
        FROM canonical_episodes ce
        LEFT JOIN provider_episodes pe
          ON pe.canonical_episode_id = ce.id AND pe.active = 1
        LEFT JOIN playback_options po ON po.provider_episode_id = pe.id
        WHERE ce.id = ?
        GROUP BY ce.id
      `).get(id);
      if (!item) throw new Error("CANONICAL_EPISODE_NOT_FOUND");
      return res.json({ data: publicEpisode(item) });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.post("/playback/sessions", (req, res) => {
    try {
      return res.status(201).json({ data: sessions.createSession(req.body) });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.get("/playback/sessions/:id", (req, res) => {
    try {
      const session = sessions.getSession(req.params.id);
      if (!session) throw new Error("PLAYBACK_SESSION_NOT_FOUND");
      return res.json({ data: session });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.post("/playback/sessions/:id/feedback", (req, res) => {
    try {
      return res.status(202).json({
        data: sessions.recordFeedback(req.params.id, req.body)
      });
    } catch (error) {
      return respondError(res, error);
    }
  });

  router.get("/episodes/:id/download-options", (req, res) => {
    try {
      return res.json({ data: sessions.downloadOptions(positiveId(req.params.id)) });
    } catch (error) {
      return respondError(res, error);
    }
  });

  return router;
}

module.exports = createV1Router();
module.exports.createV1Router = createV1Router;
module.exports.PUBLIC_ERROR_MESSAGES = PUBLIC_ERROR_MESSAGES;
