const { randomUUID } = require("node:crypto");
const {
  createPlaybackSessionRepository
} = require("../repositories/playback-session-repository");
const providers = require("../providers");
const { validProviderTarget } = require("../middleware/security");

const repository = createPlaybackSessionRepository();

const PLATFORMS = new Set(["android", "android_tv", "ios", "web", "windows"]);
const QUALITIES = new Set(["auto", "1080p", "720p", "480p"]);
const EVENT_TYPES = new Set([
  "player_opened",
  "first_frame",
  "playing",
  "buffering",
  "stalled",
  "ended",
  "fatal_error"
]);
const SESSION_STATES = new Set([
  "planning",
  "ready",
  "unavailable",
  "cancelled",
  "expired"
]);

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_CLIENT_VERSION_LENGTH = 50;
const MAX_ERROR_CODE_LENGTH = 100;
const MAX_EVENT_DETAILS_BYTES = 4096;
const MAX_EVENT_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_FEEDBACK_EVENTS_PER_MINUTE = 120;
const EVENT_DETAIL_KEYS = new Set([
  "reason",
  "player_state",
  "network_type",
  "buffered_seconds",
  "duration_seconds",
  "transport"
]);

function requiredInteger(value, code) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(code);
  return parsed;
}

function isoDate(value, code) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error(code);
  return date.toISOString();
}

function optionalString(value, maxLength, code) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text.length > maxLength) throw new Error(code);
  return text;
}

function assertPlainObject(value, code) {
  if (
    value == null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(code);
  }
  return value;
}

function assertAllowedKeys(value, allowed, code) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(code);
  }
}

function validateEventDetails(value) {
  if (value == null) return null;
  const details = assertPlainObject(value, "EVENT_DETAILS_INVALID");
  assertAllowedKeys(details, EVENT_DETAIL_KEYS, "EVENT_DETAILS_UNKNOWN_FIELD");

  for (const item of Object.values(details)) {
    const valid = item == null || typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item)) ||
      (typeof item === "string" && item.length <= 200);
    if (!valid) throw new Error("EVENT_DETAILS_INVALID");
  }

  const serialized = JSON.stringify(details);
  if (Buffer.byteLength(serialized) > MAX_EVENT_DETAILS_BYTES) {
    throw new Error("EVENT_DETAILS_TOO_LARGE");
  }
  return serialized;
}

function assertSessionId(value) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("PLAYBACK_SESSION_ID_INVALID");
  }
  return id;
}

function publicSession(row) {
  if (!SESSION_STATES.has(row.state)) {
    throw new Error("PLAYBACK_SESSION_STATE_INVALID");
  }

  return {
    id: row.id,
    canonical_episode_id: Number(row.canonical_episode_id),
    state: row.state,
    requested_quality: row.requested_quality,
    client: {
      platform: row.client_platform,
      version: row.client_version || null
    },
    plan_version: Number(row.plan_version),
    playback: row.state === "ready"
      ? {
          uri: `/v1/playback/sessions/${row.id}/media`,
          quality: row.requested_quality
        }
      : null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    expires_at: new Date(row.expires_at).toISOString()
  };
}

function withRepository(customRepository) {
  const storage = customRepository || repository;

  async function getSession(id, options = {}) {
    const sessionId = assertSessionId(id);
    const now = options.now || new Date();
    let row = await storage.getSession(sessionId);

    if (
      row &&
      !["cancelled", "expired"].includes(row.state) &&
      Date.parse(row.expires_at) <= now.getTime()
    ) {
      await storage.expireSession(sessionId);
      row = await storage.getSession(sessionId);
    }

    return row ? publicSession(row) : null;
  }

  async function createSession(input, options = {}) {
    assertPlainObject(input, "REQUEST_BODY_INVALID");
    assertAllowedKeys(
      input,
      new Set(["canonical_episode_id", "quality", "client"]),
      "REQUEST_BODY_UNKNOWN_FIELD"
    );

    const episodeId = requiredInteger(input.canonical_episode_id, "CANONICAL_EPISODE_ID_INVALID");
    const client = assertPlainObject(input.client, "CLIENT_INVALID");
    assertAllowedKeys(client, new Set(["platform", "version"]), "CLIENT_UNKNOWN_FIELD");
    const platform = String(client.platform || "").trim();
    const quality = String(input.quality || "auto").trim().toLowerCase();

    if (!PLATFORMS.has(platform)) throw new Error("CLIENT_PLATFORM_INVALID");
    if (!QUALITIES.has(quality)) throw new Error("QUALITY_INVALID");
    if (!(await storage.episodeExists(episodeId))) {
      throw new Error("CANONICAL_EPISODE_NOT_FOUND");
    }

    const clientVersion = optionalString(
      client.version,
      MAX_CLIENT_VERSION_LENGTH,
      "CLIENT_VERSION_INVALID"
    );
    const id = assertSessionId(options.id || randomUUID());
    const now = options.now || new Date();
    const ttlMs = Number(options.ttlMs || SESSION_TTL_MS);
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("SESSION_TTL_INVALID");
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

    let candidate = await storage.selectCandidate(episodeId, quality);

    if (!candidate && typeof storage.providerEpisodeSources === "function") {
      const sources = await storage.providerEpisodeSources(episodeId);
      for (const source of sources) {
        if (!providers.has(source.provider)) continue;
        const provider = providers.get(source.provider);
        if (!provider || typeof provider.getEpisode !== "function") continue;
        const target = source.source_url || source.provider_episode_id;
        if (!validProviderTarget(provider, target)) continue;
        try {
          const resolved = await provider.getEpisode(target);
          for (const option of resolved?.watch_options || []) {
            await storage.upsertResolvedWatchOption(source, option);
          }
        } catch {
          // A broken provider source must not prevent fallback to other sources.
        }
      }
      candidate = await storage.selectCandidate(episodeId, quality);
    }
    await storage.createSession({
      id,
      canonical_episode_id: episodeId,
      state: candidate ? "ready" : "planning",
      requested_quality: quality,
      client_platform: platform,
      client_version: clientVersion,
      selected_candidate_id: candidate ? Number(candidate.id) : null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: expiresAt
    });

    return getSession(id, { now });
  }

  async function recordFeedback(sessionId, input, options = {}) {
    const id = assertSessionId(sessionId);
    assertPlainObject(input, "REQUEST_BODY_INVALID");
    assertAllowedKeys(
      input,
      new Set(["event_id", "type", "occurred_at", "position_seconds", "error_code", "details"]),
      "REQUEST_BODY_UNKNOWN_FIELD"
    );

    const now = options.now || new Date();
    const session = await getSession(id, { now });
    if (!session) throw new Error("PLAYBACK_SESSION_NOT_FOUND");
    if (["cancelled", "expired"].includes(session.state)) {
      throw new Error("PLAYBACK_SESSION_NOT_ACTIVE");
    }

    const eventId = String(input.event_id || "").trim();
    const eventType = String(input.type || "").trim();
    if (!eventId || eventId.length > 100) throw new Error("EVENT_ID_INVALID");
    if (!EVENT_TYPES.has(eventType)) throw new Error("EVENT_TYPE_INVALID");

    const position = input.position_seconds == null ? null : Number(input.position_seconds);
    if (position != null && (!Number.isFinite(position) || position < 0)) {
      throw new Error("POSITION_INVALID");
    }

    const suppliedOccurredAt = isoDate(input.occurred_at, "OCCURRED_AT_INVALID");
    const occurredAt = Math.abs(Date.parse(suppliedOccurredAt) - now.getTime()) <= MAX_EVENT_CLOCK_SKEW_MS
      ? suppliedOccurredAt
      : now.toISOString();
    const errorCode = optionalString(
      input.error_code,
      MAX_ERROR_CODE_LENGTH,
      "ERROR_CODE_INVALID"
    );
    if (errorCode && !/^[A-Z0-9_.-]+$/.test(errorCode)) {
      throw new Error("ERROR_CODE_INVALID");
    }
    const details = validateEventDetails(input.details);

    if (await storage.feedbackExists(id, eventId)) {
      return { accepted: true, duplicate: true };
    }

    const windowStart = new Date(now.getTime() - 60_000).toISOString();
    const recentCount = await storage.recentFeedbackCount(id, windowStart);
    if (recentCount >= MAX_FEEDBACK_EVENTS_PER_MINUTE) {
      throw new Error("FEEDBACK_RATE_LIMITED");
    }

    const inserted = await storage.insertFeedback({
      session_id: id,
      event_id: eventId,
      event_type: eventType,
      position_seconds: position,
      error_code: errorCode,
      details_json: details,
      occurred_at: occurredAt,
      received_at: now.toISOString()
    });

    if (inserted && ["first_frame", "playing"].includes(eventType)) {
      await storage.markReady(id);
    }
    if (inserted && eventType === "fatal_error") {
      await storage.markUnavailable(id);
    }

    return { accepted: true, duplicate: !inserted };
  }

  async function mediaHandoff(sessionIdValue) {
    const id = assertSessionId(sessionIdValue);
    const session = await getSession(id);
    if (!session) throw new Error("PLAYBACK_SESSION_NOT_FOUND");
    if (session.state !== "ready") throw new Error("PLAYBACK_SESSION_NOT_ACTIVE");

    const candidate = await storage.selectedCandidate(id);
    if (!candidate) throw new Error("PLAYBACK_SESSION_NOT_ACTIVE");

    const locator = candidate.locator || (
      candidate.locator_json ? JSON.parse(candidate.locator_json) : null
    );

    if (
      ["embed", "external_player"].includes(candidate.playback_type) &&
      locator?.page_url &&
      /^https:\/\//i.test(locator.page_url) &&
      providers.has(candidate.provider) &&
      validProviderTarget(providers.get(candidate.provider), locator.page_url)
    ) {
      return {
        session_id: id,
        uri: locator.page_url
      };
    }

    return {
      session_id: id,
      uri: `/play/${encodeURIComponent(candidate.provider)}/${encodeURIComponent(candidate.watch_id)}/${encodeURIComponent(candidate.provider_episode_id)}${candidate.quality ? `?quality=${encodeURIComponent(candidate.quality)}` : ""}`
    };
  }

  async function downloadOptions(episodeIdValue) {
    const episodeId = requiredInteger(episodeIdValue, "CANONICAL_EPISODE_ID_INVALID");
    if (!(await storage.episodeExists(episodeId))) {
      throw new Error("CANONICAL_EPISODE_NOT_FOUND");
    }

    const rows = await storage.downloadOptions(episodeId);
    const items = rows.map(row => ({
      id: String(row.id),
      quality: row.quality || null,
      format: null,
      status: "resolvable"
    }));

    return {
      canonical_episode_id: episodeId,
      count: items.length,
      items,
      automatic_download: false,
      action_required: "user_selection"
    };
  }

  return {
    createSession,
    downloadOptions,
    getSession,
    mediaHandoff,
    recordFeedback
  };
}

const api = withRepository();

module.exports = {
  EVENT_TYPES,
  EVENT_DETAIL_KEYS,
  MAX_EVENT_CLOCK_SKEW_MS,
  MAX_FEEDBACK_EVENTS_PER_MINUTE,
  PLATFORMS,
  QUALITIES,
  SESSION_STATES,
  assertSessionId,
  withRepository,
  ...api
};
