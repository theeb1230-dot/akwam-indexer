const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createV1Router } = require("../src/routes/v1");

async function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use("/v1", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("v1 discovery exposes bounded provider results and user import lifecycle", async () => {
  let enqueued;
  const provider = {
    baseUrl: "https://akwam.example",
    allowedHosts: ["akwam.example"]
  };
  const registry = {
    has(name) { return name === "akwam"; },
    get(name) { return name === "akwam" ? provider : null; }
  };
  const jobs = {
    async enqueueUnique(data) {
      enqueued = data;
      return {
        created: true,
        job: { id: "job-1", status: "queued" }
      };
    },
    async get(id) {
      if (id !== "job-1") return null;
      return {
        id,
        type: "import",
        status: "completed",
        progress: 100,
        completed: 20,
        failed: 0,
        result: { canonical_series_id: 7 }
      };
    }
  };
  const router = createV1Router({
    repository: {},
    sessions: {},
    providers: registry,
    jobs,
    inlineJobs: false,
    searchAll: async query => ({
      searched_providers: 2,
      successful_providers: 1,
      failed_providers: 1,
      results: [{
        provider: "akwam",
        provider_series_id: "2758",
        title: "الذئب الوحيد",
        type: "series",
        match_score: 100,
        match_level: "strong"
      }]
    })
  });

  await withServer(router, async base => {
    const discovery = await fetch(base + "/v1/discover?q=" + encodeURIComponent("الذئب الوحيد"));
    assert.equal(discovery.status, 200);
    const discoveryBody = await discovery.json();
    assert.equal(discoveryBody.data.count, 1);
    assert.equal(discoveryBody.data.items[0].provider, "akwam");
    assert.equal(discoveryBody.data.items[0].provider_series_id, "2758");

    const imported = await fetch(base + "/v1/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "akwam", provider_series_id: "2758" })
    });
    assert.equal(imported.status, 202);
    const importBody = await imported.json();
    assert.equal(importBody.data.job_id, "job-1");
    assert.equal(enqueued.dedupe_key, "import:akwam:2758");

    const progress = await fetch(base + "/v1/imports/job-1");
    assert.equal(progress.status, 200);
    const progressBody = await progress.json();
    assert.equal(progressBody.data.status, "completed");
    assert.equal(progressBody.data.progress, 100);
  });
});

test("v1 discovery import rejects unknown provider", async () => {
  const router = createV1Router({
    repository: {},
    sessions: {},
    providers: { has() { return false; }, get() { return null; } },
    jobs: {},
    inlineJobs: false,
    searchAll: async () => ({ results: [] })
  });

  await withServer(router, async base => {
    const response = await fetch(base + "/v1/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "unknown", provider_series_id: "1" })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "DISCOVERY_PROVIDER_INVALID");
  });
});
