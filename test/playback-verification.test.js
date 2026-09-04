const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `theeb-verification-${process.pid}.sqlite`
);

const {
  HEALTH_STATE,
  getVerification,
  recordVerification
} = require("../src/services/playback-verification-store");

const candidate = {
  provider: "wecima",
  episode_id: "fixture-e1",
  watch_id: "fixture-e1",
  server: "mp4plus",
  type: "embed",
  quality: null
};

test("reachable embed is not treated as verified playback", async () => {
  const stored = await recordVerification(candidate, {
    embed_status: "reachable",
    playback_status: "unverified",
    video_element_discovered: false,
    max_current_time: 0,
    latency_ms: 100,
    checked_at: new Date().toISOString()
  });

  assert.equal(stored.health_state, HEALTH_STATE.REACHABLE);
  assert.equal(stored.playback_verified, false);
});

test("verified playback persists the runtime evidence", async () => {
  const stored = await recordVerification(candidate, {
    embed_status: "reachable",
    playback_status: "verified",
    video_element_discovered: true,
    loadedmetadata: true,
    canplay: true,
    playing: true,
    max_current_time: 2.448,
    latency_ms: 4100,
    checked_at: new Date().toISOString()
  });

  assert.equal(stored.health_state, HEALTH_STATE.PLAYBACK_VERIFIED);
  assert.equal(stored.playback_verified, true);
  assert.equal(stored.max_current_time > 2, true);
});

test("store rejects a verified label without runtime evidence", async () => {
  const invalidCandidate = { ...candidate, server: "invalid-claim" };
  const stored = await recordVerification(invalidCandidate, {
    embed_status: "reachable",
    playback_status: "verified",
    video_element_discovered: true,
    loadedmetadata: true,
    canplay: true,
    playing: false,
    max_current_time: 8,
    checked_at: new Date().toISOString()
  });

  assert.equal(stored.playback_verified, false);
  assert.equal(stored.health_state, HEALTH_STATE.DEGRADED);
});

test("verification freshness obeys its TTL", async () => {
  const staleCandidate = { ...candidate, server: "stale" };
  await recordVerification(staleCandidate, {
    embed_status: "reachable",
    playback_status: "verified",
    health: HEALTH_STATE.PLAYBACK_VERIFIED,
    max_current_time: 3,
    checked_at: new Date(Date.now() - 5000).toISOString()
  });

  const stored = await getVerification(staleCandidate, { ttlMs: 1000 });
  assert.equal(stored.fresh, false);
});
