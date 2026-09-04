const test = require("node:test");
const assert = require("node:assert/strict");
const { REQUIRED_EPISODES, validateLiveMatrix } = require("../../scripts/gates/validate-live-matrix");

function episode(number, source) {
  source = { provider: "fixture", server: null, ...source };
  return {
    episode: number,
    status: "ready",
    canonical_mapping: { canonical_key: "series:lucky", season: 1, episode: number },
    attempts: [{
      status: "healthy",
      provider: source.provider,
      server: source.server,
      type: source.type,
      validation_scope: source.validation_scope || null,
      sampled_bytes: source.type === "embed" ? null : 2048
    }],
    selected_source: source
  };
}

function report(episodes) {
  return { title: "Lucky", season: 1, episodes };
}

test("HTTP reachability is never accepted as verified embed playback", () => {
  const matrix = report(REQUIRED_EPISODES.map(number => episode(number, {
    type: "embed", validation_scope: "embed_page_reachable"
  })));
  const result = validateLiveMatrix(matrix);
  assert.equal(result.status, "failed");
  assert.ok(result.episodes.every(item => item.failures.includes("EMBED_PLAYBACK_NOT_VERIFIED")));
});

test("full E1-E7 matrix requires direct bytes or two seconds of embed playback", () => {
  const matrix = report(REQUIRED_EPISODES.map(number => number % 2
    ? episode(number, { provider: "fixture", type: "direct_mp4", validation_scope: "media_bytes_verified" })
    : { ...episode(number, { type: "embed", playback_verification: { playing: true, max_current_time: 2.1 } }) }
  ));
  assert.equal(validateLiveMatrix(matrix).status, "passed");
});

test("missing episodes and unclassified failed attempts fail closed", () => {
  const item = episode(1, { type: "direct_mp4", validation_scope: "media_bytes_verified" });
  item.attempts.unshift({ status: "failed", provider: "fixture" });
  const result = validateLiveMatrix(report([item]));
  assert.equal(result.status, "failed");
  assert.ok(result.episodes[0].failures.includes("FAILURE_CLASSIFICATION_MISSING"));
  assert.ok(result.episodes[1].failures.includes("EPISODE_MISSING"));
});

test("selected direct source must match a successful sampled-byte attempt", () => {
  const items = REQUIRED_EPISODES.map(number => episode(number, {
    provider: "fixture",
    type: "direct_mp4",
    validation_scope: "media_bytes_verified"
  }));
  items[0].attempts[0].status = "failed";
  items[0].attempts[0].reason = "SERVER_DOWN";
  items[1].attempts[0].sampled_bytes = 0;
  const result = validateLiveMatrix(report(items));
  assert.ok(result.episodes[0].failures.includes("SELECTED_FALLBACK_NOT_SUCCESSFUL"));
  assert.ok(result.episodes[1].failures.includes("DIRECT_MEDIA_BYTES_NOT_VERIFIED"));
});

test("matrix is scoped to Lucky season one", () => {
  const items = REQUIRED_EPISODES.map(number => episode(number, {
    provider: "fixture",
    type: "direct_mp4",
    validation_scope: "media_bytes_verified"
  }));
  assert.equal(validateLiveMatrix({ title: "Other", season: 1, episodes: items }).status, "failed");
});
