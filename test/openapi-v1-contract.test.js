const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const contractPath = path.join(__dirname, "..", "contracts", "openapi-v1.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

test("v1 OpenAPI contract declares every Flutter-facing operation", () => {
  assert.equal(contract.openapi, "3.1.0");
  const operations = Object.values(contract.paths)
    .flatMap(pathItem => Object.values(pathItem))
    .map(operation => operation.operationId)
    .filter(Boolean);

  assert.deepEqual(new Set(operations), new Set([
    "search", "getSeries", "listEpisodes", "getEpisode",
    "createPlaybackSession", "getPlaybackSession",
    "sendPlaybackFeedback", "listDownloadOptions"
  ]));
});

test("public schemas do not leak provider locators or temporary URLs", () => {
  const serialized = JSON.stringify(contract);
  for (const forbidden of ["provider_episode_id", "watch_id", "direct_url", "iframe", "cdn"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("legacy API remains mounted for backward compatibility", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
  assert.match(server, /app\.use\("\/v1", v1Router\)/);
  assert.match(server, /"\/api\/search"/);
  assert.match(server, /"\/api\/canonical"/);
  assert.match(server, /"\/api\/playback"/);
});

test("Dart client is transport-only and contains no scraper implementation", () => {
  const client = fs.readFileSync(path.join(__dirname, "..", "clients", "dart", "lib", "theeb_api_contract.dart"), "utf8");
  assert.match(client, /abstract interface class TheebApiTransport/);
  for (const forbidden of ["provider_episode_id", "watch_id", "iframe", "cheerio", "scrape"]) {
    assert.equal(client.toLowerCase().includes(forbidden), false, forbidden);
  }
});

test("feedback contract bounds telemetry cardinality and abuse", () => {
  const feedback = contract.components.schemas.PlaybackFeedback;
  assert.equal(feedback.additionalProperties, false);
  assert.equal(feedback.properties.details.additionalProperties, false);
  assert.match(feedback.properties.error_code.pattern, /A-Z0-9/);
  assert.ok(contract.paths["/playback/sessions/{id}/feedback"].post.responses["429"]);
});
