const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const registry = require("../../src/providers");

test("registered providers satisfy the offline structural contract", () => {
  const names = registry.list();
  assert.ok(names.length > 0);
  assert.equal(new Set(names).size, names.length);
  for (const { name, provider } of registry.entries()) {
    assert.match(name, /^[a-z0-9-]+$/);
    assert.equal(typeof provider.getSeries, "function", `${name}.getSeries`);
    assert.equal(typeof provider.getEpisode, "function", `${name}.getEpisode`);
    const declared = registry.describe(name).capabilities;
    assert.equal(declared.search, typeof provider.search === "function");
    assert.equal(declared.watch, typeof provider.getWatchInfo === "function");
  }
});

test("WeCima fixture preserves episode mapping and accepted playback server schema", async () => {
  const provider = registry.get("wecima");
  const original = provider.requestPage;
  const seriesHtml = fs.readFileSync(path.join(__dirname, "../fixtures/providers/wecima-series.html"), "utf8");
  const playHtml = fs.readFileSync(path.join(__dirname, "../fixtures/providers/wecima-play.html"), "utf8");
  provider.requestPage = async url => url.includes("play.php") ? playHtml : seriesHtml;
  try {
    const series = await provider.getSeries("lucky");
    assert.equal(series.provider, "wecima");
    assert.deepEqual(series.episodes.map(item => item.number), [1, 2]);
    assert.deepEqual(series.episodes.map(item => item.id), ["lucky-e1", "lucky-e2"]);

    const episode = await provider.getEpisode("lucky-e1");
    assert.equal(episode.episode.id, "lucky-e1");
    assert.equal(episode.watch_options[0].type, "embed");

    const watch = await provider.getWatchInfo("lucky-e1", "lucky-e1");
    assert.equal(watch.source_count, 1);
    assert.deepEqual(watch.sources.map(item => item.server), ["mp4"]);
    assert.equal(watch.resolution_trace.at(-1).status, "ok");
  } finally {
    provider.requestPage = original;
  }
});

test("unknown and duplicate providers fail closed", () => {
  assert.throws(() => registry.get("does-not-exist"), /Unknown provider/);
  assert.throws(() => registry.register("akwam", registry.get("akwam")), /already registered/);
});
