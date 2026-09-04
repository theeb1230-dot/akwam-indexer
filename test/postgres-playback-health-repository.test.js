const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PostgresPlaybackHealthRepository
} = require("../src/repositories/playback-health-repository");
const {
  withRepository: withHealthRepository
} = require("../src/services/playback-health");
const {
  HEALTH_STATE,
  withRepository: withVerificationRepository
} = require("../src/services/playback-verification-store");

function fakePool(responses = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, params });
      return responses.shift() || { rows: [], rowCount: 0 };
    }
  };
}

const candidate = {
  provider: "fixture",
  episode_id: "e1",
  watch_id: "w1",
  server: "main",
  type: "hls",
  quality: "720p",
  fallback_order: 1
};

test("PostgreSQL health update is atomic and opens a circuit by threshold", async () => {
  const pool = fakePool([{
    rows: [{
      candidate_key: "fixture|e1|w1|main|hls|720p",
      provider: "fixture",
      playback_type: "hls",
      success_count: 0,
      failure_count: 5,
      consecutive_failures: 5,
      avg_latency_ms: 1200,
      last_status: "unhealthy",
      circuit_open_until: "2099-01-01T00:00:00.000Z"
    }],
    rowCount: 1
  }]);
  const repository = new PostgresPlaybackHealthRepository(pool);
  const health = withHealthRepository(repository);

  const stored = await health.recordResult(candidate, {
    status: "unhealthy",
    reason: "SERVER_DOWN",
    latency_ms: 1200
  }, { failureThreshold: 5, cooldownMs: 60000 });

  assert.equal(stored.consecutive_failures, 5);
  assert.equal(stored.failure_count, 5);
  assert.match(pool.calls[0].sql, /ON CONFLICT\(candidate_key\) DO UPDATE/);
  assert.match(pool.calls[0].sql, /playback_health\.failure_count \+ CASE/);
  assert.match(pool.calls[0].sql, /circuit_open_until = CASE/);
});

test("PostgreSQL verification requires runtime playback evidence", async () => {
  const pool = fakePool([
    {
      rows: [{
        candidate_key: "fixture|e1|w1|main|hls|720p",
        provider: "fixture",
        server: "main",
        embed_status: "reachable",
        playback_status: "verified",
        health_state: "PLAYBACK_VERIFIED",
        video_element_discovered: true,
        loadedmetadata: true,
        canplay: true,
        playing: true,
        max_current_time: 2.5,
        latency_ms: 900,
        checked_at: new Date().toISOString()
      }],
      rowCount: 1
    },
    {
      rows: [{
        candidate_key: "fixture|e1|w1|main|hls|720p",
        provider: "fixture",
        server: "main",
        embed_status: "reachable",
        playback_status: "verified",
        health_state: "PLAYBACK_VERIFIED",
        video_element_discovered: true,
        loadedmetadata: true,
        canplay: true,
        playing: true,
        max_current_time: 2.5,
        latency_ms: 900,
        checked_at: new Date().toISOString()
      }],
      rowCount: 1
    }
  ]);
  const repository = new PostgresPlaybackHealthRepository(pool);
  const verification = withVerificationRepository(repository);

  const stored = await verification.recordVerification(candidate, {
    embed_status: "reachable",
    playback_status: "verified",
    video_element_discovered: true,
    loadedmetadata: true,
    canplay: true,
    playing: true,
    max_current_time: 2.5,
    latency_ms: 900,
    checked_at: new Date().toISOString()
  });

  assert.equal(stored.health_state, HEALTH_STATE.PLAYBACK_VERIFIED);
  assert.equal(stored.playback_verified, true);
  assert.match(pool.calls[0].sql, /ON CONFLICT\(candidate_key\) DO UPDATE/);
  assert.doesNotMatch(pool.calls[0].sql, /direct_url/i);
});
