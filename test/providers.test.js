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

test("provider descriptions reflect callable capabilities", () => {
  for (const description of providers.describeAll()) {
    assert.equal(typeof description.name, "string");
    assert.equal(description.capabilities.series, true);
    assert.equal(description.capabilities.episode, true);
    assert.equal(typeof description.capabilities.search, "boolean");
    assert.equal(typeof description.capabilities.watch, "boolean");
    assert.equal(typeof description.capabilities.download, "boolean");
    assert.equal(
      description.capabilities.download,
      typeof providers.get(description.name).getDownloadOptions === "function"
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
  assert.equal(
    normalizePlaybackSource({
      type: "video/mp4",
      direct_url: "https://media.example/video.mp4"
    }).type,
    "direct_mp4"
  );

  const embed =
    normalizePlaybackSource({
      type: "embed",
      embed_url: "https://player.example/embed/1"
    });

  assert.equal(embed.type, "embed");
  assert.equal(
    embed.client_url,
    "https://player.example/embed/1"
  );
});

test("playback plan ranks direct media before ordered embeds", () => {
  const plan = buildPlaybackPlan([
    {
      provider: "wecima",
      episode: { id: "w1" },
      watch_options: [{
        watch_id: "w1",
        sources: [
          normalizePlaybackSource({
            type: "embed",
            server: "mp4plus",
            priority: 2,
            embed_url: "https://embed.example/2"
          }),
          normalizePlaybackSource({
            type: "embed",
            server: "mp4",
            priority: 1,
            embed_url: "https://embed.example/1"
          })
        ]
      }]
    },
    {
      provider: "akwam",
      episode: { id: "a1" },
      watch_options: [{
        watch_id: "a-watch",
        play_url: "/play/akwam/a-watch/a1",
        sources: [
          normalizePlaybackSource({
            type: "video/mp4",
            quality: "1080p",
            direct_url: "https://media.example/a1.mp4"
          })
        ]
      }]
    }
  ]);

  assert.deepEqual(
    plan.map(item =>
      `${item.provider}:${item.type}:${item.server || ""}`
    ),
    [
      "akwam:direct_mp4:",
      "wecima:embed:mp4",
      "wecima:embed:mp4plus"
    ]
  );
});


test("fallback plan exposes stable retry order", () => {
  const plan = buildPlaybackPlan([{
    provider: "wecima",
    episode: { id: "e1" },
    watch_options: [{
      watch_id: "e1",
      sources: [
        normalizePlaybackSource({
          type: "embed", server: "mp4plus", priority: 2,
          embed_url: "https://example.test/2"
        }),
        normalizePlaybackSource({
          type: "embed", server: "mp4", priority: 1,
          embed_url: "https://example.test/1"
        })
      ]
    }]
  }]);

  assert.deepEqual(
    plan.map(item => item.fallback_order),
    [1, 2]
  );
  assert.equal(plan[0].server, "mp4");
  assert.equal(plan[0].fallback_on.includes("GEO_BLOCKED"), true);
});


test("Q-Ask helpers derive season generically and expose embed watch options", () => {
  const qask = providers.get("qask");
  assert.equal(qask.extractSeasonNumber("https://far.q-ask.video/video-show-s03-e07/"), 3);
  assert.equal(qask.extractSeasonNumber("مسلسل تجريبي الموسم 12 الحلقة 4"), 12);
  const cheerio = require("cheerio");
  const $ = cheerio.load('<iframe src="https://far.q-ask.video/embed/49059/"></iframe>');
  const options = qask.extractWatchOptions($, "https://far.q-ask.video/video-show-s03-e01/");
  assert.equal(options.length, 1);
  assert.equal(options[0].type, "embed");
  assert.equal(options[0].can_watch, true);
  assert.equal(options[0].can_download, false);
});
