const { randomUUID } = require("node:crypto");
const db = require("../db/schema");
const metrics = require("../observability/metrics");

const EVENTS = new Set([
  "player_opened", "first_frame", "playing", "buffering",
  "stalled", "ended", "fatal_error"
]);

function getSession(id) {
  return db.prepare("SELECT * FROM playback_sessions WHERE id = ?").get(id) || null;
}

function createSession(input = {}) {
  const id = randomUUID();
  db.prepare(`INSERT INTO playback_sessions
    (id, canonical_episode_id, client_platform, selected_candidate_key)
    VALUES (?, ?, ?, ?)`
  ).run(
    id,
    input.canonical_episode_id ? Number(input.canonical_episode_id) : null,
    String(input.client_platform || "unknown").slice(0, 40),
    input.selected_candidate_key ? String(input.selected_candidate_key).slice(0, 300) : null
  );
  metrics.increment("theeb_playback_sessions_total", { platform: String(input.client_platform || "unknown").slice(0, 40) });
  return getSession(id);
}

function recordEvent(sessionId, input = {}) {
  const type = String(input.event_type || "");
  if (!EVENTS.has(type)) {
    const error = new Error("INVALID_PLAYBACK_EVENT");
    error.code = "INVALID_PLAYBACK_EVENT";
    throw error;
  }
  if (!getSession(sessionId)) {
    const error = new Error("PLAYBACK_SESSION_NOT_FOUND");
    error.code = "PLAYBACK_SESSION_NOT_FOUND";
    throw error;
  }
  const occurredAt = input.occurred_at || new Date().toISOString();
  if (!Number.isFinite(Date.parse(occurredAt))) {
    const error = new Error("INVALID_OCCURRED_AT");
    error.code = "INVALID_OCCURRED_AT";
    throw error;
  }
  const position = input.position_seconds == null ? null : Number(input.position_seconds);
  const errorCode = input.error_code ? String(input.error_code).replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 80) : null;

  db.transaction(() => {
    db.prepare(`INSERT INTO playback_events
      (session_id, event_type, position_seconds, error_code, metadata_json, occurred_at)
      VALUES (?, ?, ?, ?, '{}', ?)`
    ).run(sessionId, type, Number.isFinite(position) ? position : null, errorCode, occurredAt);

    const status = type === "ended" ? "ended" : type === "fatal_error" ? "failed" : type === "first_frame" || type === "playing" ? "playing" : type;
    db.prepare(`UPDATE playback_sessions SET
      status = ?,
      first_frame_ms = CASE WHEN ? = 'first_frame' AND first_frame_ms IS NULL
        THEN CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER) ELSE first_frame_ms END,
      buffering_count = buffering_count + CASE WHEN ? = 'buffering' THEN 1 ELSE 0 END,
      stalled_count = stalled_count + CASE WHEN ? = 'stalled' THEN 1 ELSE 0 END,
      fatal_error_code = CASE WHEN ? = 'fatal_error' THEN ? ELSE fatal_error_code END,
      last_event_at = ?, ended_at = CASE WHEN ? IN ('ended','fatal_error') THEN ? ELSE ended_at END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(status, type, occurredAt, type, type, type, errorCode, occurredAt, type, occurredAt, sessionId);
  })();

  metrics.increment("theeb_playback_events_total", { event: type });
  return getSession(sessionId);
}

module.exports = { EVENTS, createSession, recordEvent, getSession };
