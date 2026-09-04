const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeEpisodes } = require("../../src/services/series-resolver");
const { calculateMatchScore } = require("../../src/services/search-orchestrator");
const { classifyFailure, retryPolicy, FAILURE } = require("../../src/services/failure-classifier");

test("canonical episode mapping never merges adjacent episodes", () => {
  const episodes = mergeEpisodes([
    { provider: "akwam", ok: true, episodes: [{ id: "a1", title: "الحلقة 1" }, { id: "a2", title: "الحلقة 2" }] },
    { provider: "wecima", ok: true, episodes: [{ id: "show-s01e01/", title: "Episode 01" }, { id: "show-s01e02/", title: "Episode 02" }] }
  ]);
  assert.equal(episodes.length, 2);
  assert.deepEqual(episodes.map(item => [item.season, item.number, item.source_count]), [[1, 1, 2], [1, 2, 2]]);
  assert.ok(episodes[0].sources.every(source => !source.provider_episode_id.endsWith("e02/")));
});

test("single-word titles do not false-merge related works", () => {
  assert.equal(calculateMatchScore("Lucky", "Lucky"), 100);
  assert.ok(calculateMatchScore("Lucky", "Lucky Hank") < 70);
  assert.ok(calculateMatchScore("Lucky", "Lucky Strike") < 70);
});

test("known failures remain classified and actionable", () => {
  assert.equal(classifyFailure({ code: "ETIMEDOUT" }), FAILURE.TIMEOUT);
  assert.equal(classifyFailure({ response: { status: 403, data: "blocked in your country" } }), FAILURE.GEO_BLOCKED);
  assert.deepEqual(retryPolicy(FAILURE.TIMEOUT), { retries: 1, fallback: true });
  assert.deepEqual(retryPolicy(FAILURE.HTTP_404), { retries: 0, fallback: true });
});
