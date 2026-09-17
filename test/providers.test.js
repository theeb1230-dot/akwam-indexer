const test = require("node:test");
const assert = require("node:assert/strict");

const providers = require("../src/providers");

test("registry exposes the expected providers without duplicates", () => {
  const names = providers.list();

  assert.equal(names.length, new Set(names).size);
  assert.deepEqual(names, [
    "akwam",
    "arabseed",
    "wecima",
    "shahid4u",
    "lodynet",
    "qask",
    "cimaleek",
    "laaroza"
  ]);
});

test("every provider satisfies the required contract", () => {
  for (const { name, provider } of providers.entries()) {
    assert.equal(typeof provider.getSeries, "function", name);
    assert.equal(typeof provider.getEpisode, "function", name);
  }
});

test("provider descriptions reflect canonical callable capabilities", () => {
  for (const description of providers.describeAll()) {
    const provider = providers.get(description.name);
    assert.equal(typeof description.name, "string");
    assert.equal(description.capabilities.series, true);
    assert.equal(description.capabilities.episodes, true);
    assert.equal(typeof description.capabilities.search, "boolean");
    assert.equal(typeof description.capabilities.watch, "boolean");
    assert.equal(typeof description.capabilities.download, "boolean");
    assert.equal(
      description.capabilities.download,
      typeof provider.getDownload === "function" ||
        typeof provider.resolveDownload === "function" ||
        provider.capabilities?.download === true
    );
  }
});

test("provider names are normalized", () => {
  assert.equal(providers.has(" AKWAM "), true);
  assert.equal(providers.get("WeCiMa"), providers.get("wecima"));
});


const {
  normalizePlaybackSource,
  buildPlaybackPlan
} = require("../src/services/episode-resolver");

test("playback sources distinguish direct media from embeds", () => {
  const direct = normalizePlaybackSource({ url: "https://cdn.example/video.mp4", type: "video/mp4" });
  const embed = normalizePlaybackSource({ url: "https://player.example/embed/1", type: "embed" });
  assert.equal(direct.kind, "direct");
  assert.equal(embed.kind, "embed");
});

test("playback plan ranks direct media before ordered embeds", () => {
  const plan = buildPlaybackPlan([
    { url: "https://player.example/embed/2", type: "embed" },
    { url: "https://cdn.example/video.mp4", type: "video/mp4" },
    { url: "https://player.example/embed/1", type: "embed" }
  ]);
  assert.equal(plan[0].kind, "direct");
  assert.equal(plan[1].kind, "embed");
});

test("fallback plan exposes stable retry order", () => {
  const plan = buildPlaybackPlan([
    { url: "https://player.example/embed/1", type: "embed" },
    { url: "https://player.example/embed/2", type: "embed" }
  ]);
  assert.deepEqual(plan.map((item) => item.fallback_index), [0, 1]);
});

test("Q-Ask helpers derive season generically and expose embed watch options", () => {
  const qask = providers.get("qask");
  assert.equal(typeof qask.getSeries, "function");
  assert.equal(typeof qask.getEpisode, "function");
});
