const test = require("node:test");
const assert = require("node:assert/strict");
const { privateAddress, pinPublicHost } = require("../../src/services/safe-media-request");
const axios = require("axios");
const { safeGet } = require("../../src/services/safe-media-request");

test("SSRF matrix blocks local, private, reserved, and mapped addresses", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.1.1", "100.64.0.1", "198.18.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(privateAddress(address), true, address);
  }
  assert.equal(privateAddress("1.1.1.1"), false);
  assert.equal(privateAddress("2606:4700:4700::1111"), false);
});

test("unsafe URL protocols and credentials fail before a request", async () => {
  await assert.rejects(pinPublicHost("file:///etc/passwd"), /UNSAFE_URL_PROTOCOL/);
  await assert.rejects(pinPublicHost("https://user:pass@example.com/video"), /UNSAFE_URL_CREDENTIALS/);
  await assert.rejects(pinPublicHost("http://127.0.0.1/internal"), /SSRF_PRIVATE_ADDRESS_BLOCKED/);
  await assert.rejects(pinPublicHost("not a url"), /Invalid URL/);
});

test("every redirect target is revalidated before another network request", async () => {
  const original = axios.get;
  let requests = 0;
  axios.get = async () => {
    requests++;
    return { status: 302, headers: { location: "http://127.0.0.1/private" }, data: null };
  };
  try {
    await assert.rejects(safeGet("http://1.1.1.1/start"), /SSRF_PRIVATE_ADDRESS_BLOCKED/);
    assert.equal(requests, 1);
  } finally {
    axios.get = original;
  }
});

test("PostgreSQL transport has no certificate bypass switch", () => {
  const source = require("node:fs").readFileSync(require.resolve("../../src/db/postgres"), "utf8");
  assert.doesNotMatch(source, /rejectUnauthorized\s*:\s*false/);
  assert.doesNotMatch(source, /no-verify/i);
});
