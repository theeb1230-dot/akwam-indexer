const test = require("node:test");
const assert = require("node:assert/strict");
const { runLoad } = require("../../scripts/gates/load-harness");
const { runSoak } = require("../../scripts/gates/soak-harness");

test("load gate has hard operation and concurrency ceilings", async () => {
  await assert.rejects(runLoad({ operations: 100001 }), /INVALID_LOAD_OPERATIONS/);
  await assert.rejects(runLoad({ operations: 1, concurrency: 201 }), /INVALID_LOAD_CONCURRENCY/);
});

test("soak gate has a hard cycle ceiling", async () => {
  await assert.rejects(runSoak({ cycles: 1000001 }), /INVALID_SOAK_CYCLES/);
});
