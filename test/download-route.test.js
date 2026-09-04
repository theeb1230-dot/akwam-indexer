const test = require("node:test");
const assert = require("node:assert/strict");

const express = require("express");
const {
  createDownloadRouter,
  clientDownloadResult,
  downloadErrorResponse
} = require("../src/routes/download");

test("download route hides provider locators from the client", () => {
  const result = clientDownloadResult({
    episode: { id: 15 },
    download_option_count: 1,
    automatic_download: false,
    action_required: "user_selection",
    download_options: [{
      candidate_id: "opaque",
      provider: "fixture",
      provider_episode_id: "private-episode-id",
      locator: { provider: "fixture", download_id: "private" },
      live_url: "https://temporary.example/private.mp4",
      type: "download_file",
      availability: "unknown",
      requires_user_selection: true
    }],
    source_errors: [{
      provider: "fixture",
      error: "PROVIDER_DOWNLOAD_ERROR"
    }]
  });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("private-episode-id"), false);
  assert.equal(serialized.includes('"provider"'), false);
  assert.equal(serialized.includes('"locator"'), false);
  assert.equal(serialized.includes('"live_url"'), false);
  assert.equal(result.download_options[0].id, "opaque");
  assert.equal(result.download_options[0].status, "unknown");
  assert.equal("candidate_id" in result.download_options[0], false);
  assert.deepEqual(result.source_errors, [{
    error: "PROVIDER_DOWNLOAD_ERROR"
  }]);
});

test("download route does not expose unexpected internal errors", () => {
  const response = downloadErrorResponse(new Error(
    "database failed at https://secret.example/token"
  ));

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    error: "DOWNLOAD_RESOLUTION_FAILED",
    message: "Download options could not be resolved"
  });
  assert.equal(
    JSON.stringify(response).includes("secret.example"),
    false
  );
});


test("download option handoff redirects only after explicit candidate selection", async t => {
  const resolver = {
    async resolveDownloadOptions() {
      return {
        episode: { id: 15 },
        download_option_count: 1,
        automatic_download: false,
        action_required: "user_selection",
        download_options: [{
          candidate_id: "opaque",
          live_url: "https://cdn.example.test/file.mp4"
        }],
        source_errors: []
      };
    }
  };

  const app = express();
  app.use("/v1", createDownloadRouter({ resolver }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(
    `${base}/v1/episodes/15/download-options/opaque/open`,
    { redirect: "manual" }
  );

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://cdn.example.test/file.mp4");
  assert.equal(response.headers.get("cache-control"), "no-store");

  const missing = await fetch(
    `${base}/v1/episodes/15/download-options/missing/open`,
    { redirect: "manual" }
  );
  assert.equal(missing.status, 404);
});
