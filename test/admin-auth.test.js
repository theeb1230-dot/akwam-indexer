const test = require("node:test");
const assert = require("node:assert/strict");
const adminAuth = require("../src/middleware/admin-auth");

function response() {
  return { code: null, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test("admin API fails closed without a configured token", () => {
  const previous = process.env.ADMIN_READ_TOKEN;
  delete process.env.ADMIN_READ_TOKEN;
  const res = response();
  adminAuth({ get: () => "" }, res, () => assert.fail("must not continue"));
  assert.equal(res.code, 503);
  if (previous) process.env.ADMIN_READ_TOKEN = previous;
});

test("admin API uses bearer authentication", () => {
  process.env.ADMIN_READ_TOKEN = "a-strong-test-token";
  let called = false;
  const res = response();
  adminAuth({ get: () => "Bearer a-strong-test-token" }, res, () => { called = true; });
  assert.equal(called, true);
  delete process.env.ADMIN_READ_TOKEN;
});
