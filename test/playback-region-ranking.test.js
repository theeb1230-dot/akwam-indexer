const test = require("node:test");
const assert = require("node:assert/strict");

const { withRepository } = require("../src/services/playback-health");

function ranking() {
  return withRepository({
    async getHealth() { return null; },
    async getVerification() { return null; }
  });
}

test("playback ranking prefers an explicitly matching region", async () => {
  const health = ranking();
  const candidates = [
    {
      provider: "global",
      server: "a",
      episode_id: "1",
      watch_id: "1",
      type: "hls",
      quality: "720p",
      regions: ["US"],
      fallback_order: 1
    },
    {
      provider: "saudi",
      server: "b",
      episode_id: "1",
      watch_id: "1",
      type: "hls",
      quality: "720p",
      regions: ["SA", "AE"],
      fallback_order: 1
    }
  ];

  const ranked = await health.ranked(candidates, { region: "sa" });

  assert.equal(ranked[0].provider, "saudi");
  assert.ok(ranked[0].health_score > ranked[1].health_score);
});

test("unknown region metadata stays neutral instead of being rejected", async () => {
  const health = ranking();
  assert.equal(health.regionScore({ provider: "unknown" }, "SA"), 0);
  assert.equal(health.regionScore({ regions: ["US"] }, "SA"), -8);
  assert.equal(health.regionScore({ region: "sa" }, "SA"), 12);
  assert.equal(health.normalizeRegion("sa"), "SA");
  assert.equal(health.normalizeRegion("saudi"), null);
});

test("equal playback scores use deterministic fallback and provider ordering", async () => {
  const health = ranking();
  const ranked = await health.ranked([
    {
      provider: "zeta",
      server: "b",
      episode_id: "1",
      watch_id: "1",
      type: "hls",
      quality: "720p",
      fallback_order: 2
    },
    {
      provider: "beta",
      server: "a",
      episode_id: "1",
      watch_id: "1",
      type: "hls",
      quality: "720p",
      fallback_order: 1
    },
    {
      provider: "alpha",
      server: "a",
      episode_id: "1",
      watch_id: "1",
      type: "hls",
      quality: "720p",
      fallback_order: 1
    }
  ]);

  assert.deepEqual(ranked.map(item => item.provider), ["alpha", "beta", "zeta"]);
});


test("playback executor forwards the requested region into ranking", async () => {
  const sharedHealth = require("../src/services/playback-health");
  const { executePlayback } = require("../src/services/playback-executor");
  const original = {
    ranked: sharedHealth.ranked,
    circuitOpen: sharedHealth.circuitOpen,
    recordResult: sharedHealth.recordResult
  };
  let receivedRegion;

  try {
    sharedHealth.ranked = async (candidates, options) => {
      receivedRegion = options.region;
      return candidates;
    };
    sharedHealth.circuitOpen = async () => false;
    sharedHealth.recordResult = async () => ({
      success_count: 1,
      failure_count: 0,
      consecutive_failures: 0,
      avg_latency_ms: 1,
      circuit_open_until: null
    });

    const result = await executePlayback(
      { query: "fixture", season: 1, episode: 1, region: "SA" },
      {
        resolve: async () => ({
          canonical_key: "fixture",
          group_key: "fixture",
          title: "Fixture",
          season: 1,
          episode: 1,
          matched_sources: 1,
          resolved_sources: 1,
          playable_sources: 1,
          failed_sources: 0,
          playback_option_count: 1,
          sources: [],
          playback_plan: [{
            provider: "fixture",
            episode_id: "1",
            watch_id: "1",
            type: "hls",
            quality: "720p"
          }]
        }),
        validate: async () => ({
          status: "healthy",
          latency_ms: 1
        })
      }
    );

    assert.equal(receivedRegion, "SA");
    assert.equal(result.status, "ready");
  } finally {
    sharedHealth.ranked = original.ranked;
    sharedHealth.circuitOpen = original.circuitOpen;
    sharedHealth.recordResult = original.recordResult;
  }
});
