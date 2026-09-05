const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateClientApiUrl,
  validatePublicDns
} = require("../scripts/validate-client-api-url");

test("delivery API URL rejects placeholders, local hosts and insecure schemes", () => {
  for (const value of [
    "",
    "https://example.invalid/",
    "https://example.com/",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://0.0.0.0/",
    "http://api.theeb.example.org/",
    "https://api.test/",
    "https://api.local/"
  ]) {
    assert.throws(() => validateClientApiUrl(value));
  }
});

test("delivery API URL accepts a normalized public HTTPS origin", () => {
  const url = validateClientApiUrl("https://api.theeb.example.org/base");
  assert.equal(url.href, "https://api.theeb.example.org/base/");
});

test("delivery API DNS validation fails closed on mixed public/private answers", async () => {
  await assert.rejects(
    validatePublicDns(
      new URL("https://api.theeb.example.org/"),
      async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "127.0.0.1", family: 4 }
      ]
    ),
    /THEEB_API_DNS_PRIVATE_ADDRESS/
  );
});

test("delivery API DNS validation accepts public-only answers", async () => {
  const records = await validatePublicDns(
    new URL("https://api.theeb.example.org/"),
    async () => [
      { address: "1.1.1.1", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 }
    ]
  );
  assert.equal(records.length, 2);
});
