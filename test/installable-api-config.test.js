const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseInstallableBase,
  isPrivateAddress
} = require("../scripts/validate-installable-api-url");

test("installable API config accepts only remote HTTPS production-like URLs", () => {
  assert.equal(
    parseInstallableBase("https://api.theeb.sa").toString(),
    "https://api.theeb.sa/"
  );
});

test("installable API config rejects placeholders and local targets", () => {
  const invalid = [
    "",
    "not-a-url",
    "http://api.theeb.sa/",
    "https://example.invalid/",
    "https://example.com/",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://0.0.0.0/",
    "https://staging.theeb.sa/",
    "https://test.theeb.sa/",
    "https://user:pass@api.theeb.sa/",
    "https://api.theeb.sa/?mode=test"
  ];

  for (const value of invalid) {
    assert.throws(() => parseInstallableBase(value), { name: "Error" }, value);
  }
});

test("installable API DNS policy rejects private and loopback addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.10",
    "100.64.0.1",
    "169.254.1.1",
    "192.0.2.10",
    "198.18.0.1",
    "198.51.100.10",
    "203.0.113.10",
    "::1",
    "fd00::1",
    "2001:db8::1",
    "::ffff:127.0.0.1"
  ]) {
    assert.equal(isPrivateAddress(address), true, address);
  }

  assert.equal(isPrivateAddress("1.1.1.1"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});
