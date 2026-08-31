const test = require("node:test");
const assert = require("node:assert/strict");
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

test("unknown and duplicate providers fail closed", () => {
  assert.throws(() => registry.get("does-not-exist"), /Unknown provider/);
  assert.throws(() => registry.register("akwam", registry.get("akwam")), /already registered/);
});
