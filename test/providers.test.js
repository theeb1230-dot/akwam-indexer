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
  }
});

test("provider names are normalized", () => {
  assert.equal(providers.has(" AKWAM "), true);
  assert.equal(providers.get("WeCiMa"), providers.get("wecima"));
});
