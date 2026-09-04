const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createRefreshRouter } = require("../src/routes/refresh");
const { createRefreshAllRouter } = require("../src/routes/refresh-all");

function start(app) {
  const server = app.listen(0, "127.0.0.1");
  return new Promise(resolve => server.once("listening", () => resolve(server)));
}

function base(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

test("single refresh route supports async repository and async job manager", async t => {
  const calls = [];
  const repository = {
    async listAllSeries() {
      return [{ id: 7, provider: "fixture", provider_series_id: "s7", title: "Fixture" }];
    }
  };
  const jobs = {
    async getAll() { return []; },
    async create(data) {
      calls.push(data);
      return { id: "job-7", status: "queued", ...data };
    }
  };

  const app = express();
  app.use("/api/library", createRefreshRouter({
    repository,
    jobs,
    shouldExecuteJobsInline: () => false
  }));
  const server = await start(app);
  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await fetch(`${base(server)}/api/library/series/7/refresh`, { method: "POST" });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.job_id, "job-7");
  assert.equal(body.provider_series_id, "s7");
  assert.equal(calls[0].type, "refresh");
});

test("single refresh route rejects duplicate active job", async t => {
  const repository = {
    async listAllSeries() {
      return [{ id: 8, provider: "fixture", provider_series_id: "s8", title: "Fixture" }];
    }
  };
  const jobs = {
    async getAll() {
      return [{
        id: "existing",
        type: "refresh",
        provider: "fixture",
        provider_series_id: "s8",
        status: "running"
      }];
    },
    async create() { throw new Error("must not create"); }
  };

  const app = express();
  app.use("/api/library", createRefreshRouter({
    repository,
    jobs,
    shouldExecuteJobsInline: () => false
  }));
  const server = await start(app);
  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await fetch(`${base(server)}/api/library/series/8/refresh`, { method: "POST" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "REFRESH_ALREADY_RUNNING");
});

test("refresh-all route supports async repository and async job manager", async t => {
  const repository = {
    async listAllSeries() {
      return [
        { id: 1, provider: "fixture", provider_series_id: "a", title: "A" },
        { id: 2, provider: "fixture", provider_series_id: "b", title: "B" }
      ];
    }
  };
  const jobs = {
    async getAll() { return []; },
    async create(data) {
      return { id: "parent", status: "queued", ...data };
    }
  };

  const app = express();
  app.use("/api/library", createRefreshAllRouter({
    repository,
    jobs,
    shouldExecuteJobsInline: () => false
  }));
  const server = await start(app);
  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await fetch(`${base(server)}/api/library/refresh-all`, { method: "POST" });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.job_id, "parent");
  assert.equal(body.series_count, 2);
});

test("refresh-all returns library empty before creating job", async t => {
  const repository = { async listAllSeries() { return []; } };
  const jobs = {
    async getAll() { throw new Error("must not read jobs"); },
    async create() { throw new Error("must not create"); }
  };

  const app = express();
  app.use("/api/library", createRefreshAllRouter({
    repository,
    jobs,
    shouldExecuteJobsInline: () => false
  }));
  const server = await start(app);
  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await fetch(`${base(server)}/api/library/refresh-all`, { method: "POST" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "LIBRARY_EMPTY");
});
