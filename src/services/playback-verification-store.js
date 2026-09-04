const {
  candidateKey
} = require("./playback-health");
const {
  createPlaybackHealthRepository
} = require("../repositories/playback-health-repository");

const repository = createPlaybackHealthRepository();

const HEALTH_STATE = Object.freeze({
  UNKNOWN: "UNKNOWN",
  RESOLVING: "RESOLVING",
  REACHABLE: "REACHABLE",
  PLAYBACK_VERIFIED: "PLAYBACK_VERIFIED",
  DEGRADED: "DEGRADED",
  TEMPORARILY_FAILED: "TEMPORARILY_FAILED",
  BLOCKED: "BLOCKED",
  UNAVAILABLE: "UNAVAILABLE"
});

function withRepository(customRepository) {
  const store = customRepository || repository;

  async function getVerification(candidate, options = {}) {
    const row = await store.getVerification(candidateKey(candidate));
    if (!row) return null;

    const ttlMs = Number(options.ttlMs || 10 * 60 * 1000);
    const checkedAt = Date.parse(row.checked_at);
    return {
      ...row,
      video_element_discovered: Boolean(row.video_element_discovered),
      loadedmetadata: Boolean(row.loadedmetadata),
      canplay: Boolean(row.canplay),
      playing: Boolean(row.playing),
      fresh: Date.now() - checkedAt <= ttlMs,
      age_seconds: Math.max(0, Math.floor((Date.now() - checkedAt) / 1000)),
      playback_verified: row.playback_status === "verified"
    };
  }

  async function recordVerification(candidate, result) {
    const playbackVerified =
      result.playback_status === "verified" &&
      result.video_element_discovered === true &&
      result.loadedmetadata === true &&
      result.canplay === true &&
      result.playing === true &&
      Number(result.max_current_time || 0) > 2;

    const healthState = playbackVerified
      ? HEALTH_STATE.PLAYBACK_VERIFIED
      : result.embed_status === "reachable"
        ? result.video_element_discovered
          ? HEALTH_STATE.DEGRADED
          : HEALTH_STATE.REACHABLE
        : result.health === HEALTH_STATE.BLOCKED
          ? HEALTH_STATE.BLOCKED
          : HEALTH_STATE.TEMPORARILY_FAILED;

    await store.upsertVerification({
      candidate_key: candidateKey(candidate),
      provider: candidate.provider,
      server: candidate.server || null,
      embed_status: result.embed_status || null,
      playback_status: playbackVerified ? "verified" : "unverified",
      health_state: healthState,
      video_element_discovered: result.video_element_discovered ? 1 : 0,
      loadedmetadata: result.loadedmetadata ? 1 : 0,
      canplay: result.canplay ? 1 : 0,
      playing: result.playing ? 1 : 0,
      max_current_time: Number(result.max_current_time || 0),
      latency_ms: Number(result.latency_ms || 0),
      checked_at: result.checked_at || new Date().toISOString()
    });

    return getVerification(candidate);
  }

  return {
    getVerification,
    recordVerification
  };
}

module.exports = {
  HEALTH_STATE,
  withRepository,
  ...withRepository()
};
