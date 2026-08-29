const db =
  require("../db/schema");

const {
  candidateKey
} = require("./playback-health");

const HEALTH_STATE =
  Object.freeze({
    UNKNOWN: "UNKNOWN",
    RESOLVING: "RESOLVING",
    REACHABLE: "REACHABLE",
    PLAYBACK_VERIFIED:
      "PLAYBACK_VERIFIED",
    DEGRADED: "DEGRADED",
    TEMPORARILY_FAILED:
      "TEMPORARILY_FAILED",
    BLOCKED: "BLOCKED",
    UNAVAILABLE: "UNAVAILABLE"
  });

function getVerification(
  candidate,
  options = {}
) {
  const row =
    db.prepare(`
      SELECT *
      FROM playback_verification
      WHERE candidate_key = ?
    `).get(
      candidateKey(candidate)
    );

  if (!row) {
    return null;
  }

  const ttlMs =
    Number(
      options.ttlMs ||
      10 * 60 * 1000
    );

  return {
    ...row,
    fresh:
      Date.now() -
        Date.parse(
          row.checked_at
        ) <=
      ttlMs,
    age_seconds:
      Math.max(
        0,
        Math.floor(
          (
            Date.now() -
            Date.parse(
              row.checked_at
            )
          ) / 1000
        )
      ),
    playback_verified:
      row.playback_status ===
      "verified"
  };
}

function recordVerification(
  candidate,
  result
) {
  const healthState =
    result.health ||
    (
      result.playback_status ===
        "verified"
        ? HEALTH_STATE
            .PLAYBACK_VERIFIED
        : result.embed_status ===
            "reachable"
          ? HEALTH_STATE.REACHABLE
          : HEALTH_STATE
              .TEMPORARILY_FAILED
    );

  db.prepare(`
    INSERT INTO playback_verification (
      candidate_key, provider, server,
      embed_status, playback_status,
      health_state,
      video_element_discovered,
      loadedmetadata, canplay, playing,
      max_current_time, latency_ms,
      checked_at, updated_at
    )
    VALUES (
      @candidate_key, @provider, @server,
      @embed_status, @playback_status,
      @health_state,
      @video_element_discovered,
      @loadedmetadata, @canplay, @playing,
      @max_current_time, @latency_ms,
      @checked_at, CURRENT_TIMESTAMP
    )
    ON CONFLICT(candidate_key)
    DO UPDATE SET
      embed_status =
        excluded.embed_status,
      playback_status =
        excluded.playback_status,
      health_state =
        excluded.health_state,
      video_element_discovered =
        excluded.video_element_discovered,
      loadedmetadata =
        excluded.loadedmetadata,
      canplay =
        excluded.canplay,
      playing =
        excluded.playing,
      max_current_time =
        excluded.max_current_time,
      latency_ms =
        excluded.latency_ms,
      checked_at =
        excluded.checked_at,
      updated_at =
        CURRENT_TIMESTAMP
  `).run({
    candidate_key:
      candidateKey(candidate),
    provider:
      candidate.provider,
    server:
      candidate.server || null,
    embed_status:
      result.embed_status || null,
    playback_status:
      result.playback_status ||
      "unverified",
    health_state:
      healthState,
    video_element_discovered:
      result
        .video_element_discovered
        ? 1
        : 0,
    loadedmetadata:
      result.loadedmetadata
        ? 1
        : 0,
    canplay:
      result.canplay
        ? 1
        : 0,
    playing:
      result.playing
        ? 1
        : 0,
    max_current_time:
      Number(
        result.max_current_time ||
        0
      ),
    latency_ms:
      Number(
        result.latency_ms || 0
      ),
    checked_at:
      result.checked_at ||
      new Date().toISOString()
  });

  return getVerification(
    candidate
  );
}

module.exports = {
  HEALTH_STATE,
  getVerification,
  recordVerification
};
