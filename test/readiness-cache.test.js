const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCachedCheck,
  readinessTtlMs
} = require("../src/db/readiness");

test("readiness TTL is bounded", () => {
  assert.equal(readinessTtlMs(undefined), 2000);
  assert.equal(readinessTtlMs("500"), 500);
  assert.throws(
    () => readinessTtlMs("100"),
    error => error.code === "INVALID_READINESS_SUCCESS_TTL_MS"
  );
  assert.throws(
    () => readinessTtlMs("10001"),
    error => error.code === "INVALID_READINESS_SUCCESS_TTL_MS"
  );
});

test("successful readiness probes are cached briefly", async () => {
  let calls = 0;
  let clock = 1000;
  const check = createCachedCheck(
    async () => {
      calls += 1;
    },
    {
      ttlMs: 1000,
      now: () => clock
    }
  );

  await check();
  await check();
  assert.equal(calls, 1);

  clock = 1999;
  await check();
  assert.equal(calls, 1);

  clock = 2000;
  await check();
  assert.equal(calls, 2);
});

test("concurrent readiness probes coalesce into one database check", async () => {
  let calls = 0;
  let release;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const check = createCachedCheck(async () => {
    calls += 1;
    await pending;
  });

  const first = check();
  const second = check();
  assert.equal(calls, 0);

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);

  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

test("failed readiness probes are never cached", async () => {
  let calls = 0;
  const check = createCachedCheck(async () => {
    calls += 1;
    if (calls === 1) throw new Error("DATABASE_DOWN");
  });

  await assert.rejects(check(), /DATABASE_DOWN/);
  await check();
  assert.equal(calls, 2);
});
