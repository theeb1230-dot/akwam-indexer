const test = require("node:test");
const assert = require("node:assert/strict");
const providers = require("../src/providers");
const { validProviderTarget } = require("../src/middleware/security");

test("QAsk discovery redirect host is an allowed provider target", () => {
  const qask = providers.get("qask");
  assert.equal(
    validProviderTarget(qask, "https://e.q-ask.video/video-yalniz-kurt-e13/"),
    true
  );
  assert.equal(
    validProviderTarget(qask, "https://far.q-ask.video/video-yalniz-kurt-e13/"),
    true
  );
  assert.equal(
    validProviderTarget(qask, "https://example.invalid/video-yalniz-kurt-e13/"),
    false
  );
});
