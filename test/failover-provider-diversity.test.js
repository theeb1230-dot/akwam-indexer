const test = require("node:test");
const assert = require("node:assert/strict");

const {
  executePlayback,
  maxAttemptLimit,
  providerDiversePlan
} = require("../src/services/playback-executor");

function candidate(provider, server) {
  return {
    provider,
    server,
    type: "direct_mp4",
    quality: "720p",
    episode_id: provider + "-episode",
    watch_id: provider + "-watch"
  };
}

function fakeHealth() {
  return {
    async ranked(items) { return items; },
    async circuitOpen() { return false; },
    async recordResult() {
      return {
        success_count: 0,
        failure_count: 1,
        consecutive_failures: 1,
        avg_latency_ms: 10,
        circuit_open_until: null
      };
    }
  };
}

function resolved(plan) {
  return {
    canonical_key: "fixture",
    group_key: "fixture",
    title: "Fixture",
    season: 1,
    episode: 1,
    matched_sources: plan.length,
    resolved_sources: plan.length,
    playable_sources: plan.length,
    failed_sources: 0,
    playback_option_count: plan.length,
    sources: [],
    playback_plan: plan
  };
}

test("provider diversity tries another provider before secondary servers", () => {
  const plan = providerDiversePlan([
    candidate("a", "a1"),
    candidate("a", "a2"),
    candidate("b", "b1"),
    candidate("c", "c1")
  ]);

  assert.deepEqual(
    plan.map(item => item.provider + ":" + item.server),
    ["a:a1", "b:b1", "c:c1", "a:a2"]
  );
});

test("playback failover crosses providers before retrying same provider server", async () => {
  const seen = [];
  const plan = [
    candidate("a", "a1"),
    candidate("a", "a2"),
    candidate("b", "b1")
  ];

  const result = await executePlayback(
    { query: "Fixture", season: 1, episode: 1 },
    {
      resolve: async () => resolved(plan),
      health: fakeHealth(),
      validate: async item => {
        seen.push(item.provider + ":" + item.server);
        return item.provider === "b"
          ? { status: "healthy", latency_ms: 5 }
          : { status: "failed", reason: "NOT_FOUND", latency_ms: 5 };
      }
    }
  );

  assert.equal(result.status, "ready");
  assert.deepEqual(seen, ["a:a1", "b:b1"]);
  assert.equal(result.selected_source.provider, "b");
});

test("playback failover enforces a bounded total attempt limit", async () => {
  const plan = [
    candidate("a", "a1"),
    candidate("b", "b1"),
    candidate("c", "c1")
  ];

  const result = await executePlayback(
    { query: "Fixture", season: 1, episode: 1 },
    {
      resolve: async () => resolved(plan),
      health: fakeHealth(),
      maxAttempts: 2,
      validate: async () => ({
        status: "failed",
        reason: "NOT_FOUND",
        latency_ms: 5
      })
    }
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.attempt_limit_reached, true);
  assert.equal(result.attempts_count, 2);
  assert.deepEqual(result.attempts.map(item => item.provider), ["a", "b"]);
});

test("attempt limit is clamped to safe bounds", () => {
  assert.equal(maxAttemptLimit({ maxAttempts: 0 }), 12);
  assert.equal(maxAttemptLimit({ maxAttempts: 1 }), 1);
  assert.equal(maxAttemptLimit({ maxAttempts: 500 }), 50);
});
