const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { Readable } = require("node:stream");

const { requestBodyLimit, securityConfig, tokensEqual } = require("../src/config/security");
const {
  authentication,
  bearerToken,
  errorEnvelope,
  inputGuard,
  rateLimiter,
  validProviderTarget
} = require("../src/middleware/security");
const {
  enforceResponseSize,
  pinPublicHost,
  privateAddress,
  safeGet,
  validateResolvedRecords
} = require("../src/services/safe-media-request");
const {
  tlsVerificationError
} = require("../src/services/tls-diagnostics");

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

test("production authentication fails closed without a strong secret", () => {
  assert.throws(
    () => securityConfig({ NODE_ENV: "production", THEEB_API_TOKEN: "short" }),
    /AT_LEAST_32/
  );
  assert.equal(
    securityConfig({ NODE_ENV: "production", THEEB_API_TOKEN: "x".repeat(32) }).authRequired,
    true
  );
  assert.equal(
    securityConfig({ THEEB_TRUST_PROXY_HOPS: "1" }).trustProxy,
    1
  );
  assert.throws(
    () => securityConfig({ THEEB_AUTH_REQUIRED: "maybe" }),
    /INVALID_BOOLEAN/
  );
  assert.throws(
    () => securityConfig({ NODE_ENV: "production", THEEB_AUTH_REQUIRED: "false" }),
    /PRODUCTION_AUTH_CANNOT_BE_DISABLED/
  );
  assert.equal(requestBodyLimit("256kb"), "256kb");
  assert.throws(() => requestBodyLimit("2mb"), /INVALID_REQUEST_BODY_LIMIT/);
  assert.throws(() => requestBodyLimit("unlimited"), /INVALID_REQUEST_BODY_LIMIT/);
});

test("Bearer authentication uses exact tokens", () => {
  const config = { authRequired: true, apiToken: "a".repeat(32) };
  const denied = response();
  authentication(config)(
    { method: "GET", path: "/api/search", originalUrl: "/api/search", headers: { authorization: "Bearer wrong" } },
    denied,
    () => assert.fail("invalid token must not continue")
  );
  assert.equal(denied.statusCode, 401);

  let continued = false;
  authentication(config)(
    { method: "GET", path: "/api/search", originalUrl: "/api/search", headers: { authorization: `Bearer ${"a".repeat(32)}` } },
    response(),
    () => { continued = true; }
  );
  assert.equal(continued, true);
  assert.equal(bearerToken("Basic abc"), "");
  assert.equal(tokensEqual("abc", "abd"), false);
});

test("rate limiter emits quota headers and blocks overflow", () => {
  let timestamp = 1_000;
  const middleware = rateLimiter({ rateLimitWindowMs: 60_000, rateLimitMax: 2 }, () => timestamp);
  const request = { ip: "203.0.113.9", socket: {}, headers: {} };
  middleware(request, response(), () => {});
  middleware(request, response(), () => {});
  const blocked = response();
  middleware(request, blocked, () => assert.fail("overflow must not continue"));
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers["Retry-After"], 60);

  timestamp += 60_001;
  let continued = false;
  middleware(request, response(), () => { continued = true; });
  assert.equal(continued, true);
});

test("rate limiter scopes quotas and ignores forwarding headers itself", () => {
  const config = { rateLimitWindowMs: 60_000, rateLimitMax: 50 };
  const middleware = rateLimiter(config, () => 1_000, {
    scope: "telemetry",
    maximum: 1,
    maxClients: 2
  });
  middleware(
    { ip: "203.0.113.8", socket: {}, headers: { "x-forwarded-for": "1.1.1.1" } },
    response(),
    () => {}
  );
  const blocked = response();
  middleware(
    { ip: "203.0.113.8", socket: {}, headers: { "x-forwarded-for": "8.8.8.8" } },
    blocked,
    () => assert.fail("forwarding headers must not create a new limiter key")
  );
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers["RateLimit-Limit"], 1);
});

test("input validation rejects oversized and prototype-shaped values", () => {
  const guard = inputGuard({ maxIdentifierLength: 20, maxQueryLength: 5 });
  const oversized = response();
  guard({ originalUrl: "/api/search?q=abcdef", path: "/api/search", params: {}, query: { q: "abcdef" }, body: {} }, oversized, () => {});
  assert.equal(oversized.statusCode, 400);

  const poisoned = Object.create(null);
  Object.defineProperty(poisoned, "__proto__", { value: "x", enumerable: true });
  const invalid = response();
  guard({ originalUrl: "/api", path: "/api", params: {}, query: {}, body: poisoned }, invalid, () => {});
  assert.equal(invalid.statusCode, 400);

  const invalidKey = response();
  guard({
    originalUrl: "/api",
    path: "/api",
    params: {},
    query: {},
    body: { ["x".repeat(21)]: "value" }
  }, invalidKey, () => {});
  assert.equal(invalidKey.statusCode, 400);
});

test("SSRF matrix blocks private, mapped, reserved and mixed DNS answers", () => {
  const blocked = [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1",
    "169.254.1.1", "172.16.0.1", "192.168.1.1", "224.0.0.1",
    "::", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1",
    "::ffff:7f00:1", "::7f00:1", "0:0:0:0:0:0:7f00:1",
    "2001:db8::1", "ff02::1", "64:ff9b::1", "64:ff9b:1::1",
    "2001:0000::1", "2002:0808:0808::1", "192.0.0.1", "192.88.99.1"
  ];
  for (const address of blocked) assert.equal(privateAddress(address), true, address);
  assert.equal(privateAddress("1.1.1.1"), false);
  assert.equal(privateAddress("2606:4700:4700::1111"), false);
  assert.throws(
    () => validateResolvedRecords([
      { address: "1.1.1.1", family: 4 },
      { address: "127.0.0.1", family: 4 }
    ]),
    /SSRF_PRIVATE_ADDRESS_BLOCKED/
  );
});

test("numeric and alternate localhost forms cannot bypass address checks", async () => {
  for (const url of [
    "http://2130706433/",
    "http://0177.0.0.1/",
    "http://0x7f000001/",
    "http://[::ffff:127.0.0.1]/"
  ]) {
    await assert.rejects(() => pinPublicHost(url), /SSRF_PRIVATE_ADDRESS_BLOCKED/);
  }
  await assert.rejects(
    () => pinPublicHost("file:///etc/passwd"),
    /UNSAFE_URL_PROTOCOL/
  );
  await assert.rejects(
    () => pinPublicHost("https://user:secret@example.test/"),
    /UNSAFE_URL_CREDENTIALS/
  );
});

test("redirect destinations are DNS-validated again and rebinding is blocked", async () => {
  let lookups = 0;
  let requests = 0;
  const lookup = async () => {
    lookups += 1;
    return [{ address: lookups === 1 ? "8.8.8.8" : "127.0.0.1", family: 4 }];
  };
  await assert.rejects(
    () => safeGet("https://provider.test/start", {}, {
      lookup,
      request: async () => {
        requests += 1;
        return { status: 302, headers: { location: "/next" }, data: null };
      }
    }),
    /SSRF_PRIVATE_ADDRESS_BLOCKED/
  );
  assert.equal(requests, 1);
  assert.equal(lookups, 2);
});

test("HTTPS redirects cannot downgrade and each request uses a pinned lookup", async () => {
  let pinnedAddress;
  await assert.rejects(
    () => safeGet("https://provider.test/start", {}, {
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      request: async (_url, config) => {
        config.httpsAgent.options.lookup("provider.test", {}, (_error, address) => {
          pinnedAddress = address;
        });
        return { status: 302, headers: { location: "http://provider.test/next" }, data: null };
      }
    }),
    /INSECURE_REDIRECT_DOWNGRADE/
  );
  assert.equal(pinnedAddress, "8.8.8.8");
});

test("safe requests expose the validated final URL after redirects", async () => {
  const visited = [];
  const result = await safeGet("https://provider.test/start", {}, {
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    request: async url => {
      visited.push(url);
      return visited.length === 1
        ? { status: 302, headers: { location: "/final" }, data: null }
        : { status: 200, headers: {}, data: "ok" };
    }
  });
  assert.equal(result.finalUrl, "https://provider.test/final");
  assert.deepEqual(visited, [
    "https://provider.test/start",
    "https://provider.test/final"
  ]);
});

test("response limits cover declarations, buffered bodies and streams", async () => {
  assert.throws(
    () => enforceResponseSize({ headers: { "content-length": "11" }, data: "small" }, 10),
    /RESPONSE_BODY_TOO_LARGE/
  );
  assert.throws(
    () => enforceResponseSize({ headers: {}, data: "12345678901" }, 10),
    /RESPONSE_BODY_TOO_LARGE/
  );

  const responseWithStream = enforceResponseSize(
    { headers: {}, data: Readable.from([Buffer.alloc(8), Buffer.alloc(8)]) },
    10
  );
  await assert.rejects(
    async () => {
      for await (const _chunk of responseWithStream.data) { /* consume */ }
    },
    /RESPONSE_BODY_TOO_LARGE/
  );
});

test("provider URL identifiers are restricted to the registered HTTPS host", () => {
  const provider = { baseUrl: "https://media.example" };
  assert.equal(validProviderTarget(provider, "12345"), true);
  assert.equal(validProviderTarget(provider, "https://media.example/series/1"), true);
  assert.equal(validProviderTarget(provider, "https://evil.example/series/1"), false);
  assert.equal(validProviderTarget(provider, "http://media.example/series/1"), false);
  assert.equal(validProviderTarget(provider, "https://user:pass@media.example/1"), false);
});

test("versioned errors redact upstream messages and secret-shaped details", () => {
  const req = { requestId: "request-1" };
  const res = response();
  errorEnvelope(req, res, () => {});
  res.json({
    error: "PROVIDER_SERIES_FAILED",
    message: "request failed for https://secret.invalid/?token=abc",
    stack: "sensitive stack",
    provider: "akwam"
  });
  assert.deepEqual(res.body, {
    error: {
      schema_version: "1.0",
      code: "PROVIDER_SERIES_FAILED",
      message: "The provider series request failed.",
      details: { provider: "akwam" }
    },
    request_id: "request-1"
  });
});

test("playback streaming uses the redirect-validating safe request layer", () => {
  const source = fs.readFileSync(require.resolve("../src/routes/play"), "utf8");
  assert.match(source, /safeGet\(source\.direct_url/);
  assert.doesNotMatch(source, /rejectUnauthorized\s*:\s*false/);
  assert.doesNotMatch(source, /axios\.get\(source\.direct_url/);
});

test("safe request enforces response limits and disables automatic redirects", () => {
  const source = fs.readFileSync(require.resolve("../src/services/safe-media-request"), "utf8");
  assert.match(source, /maxRedirects:\s*0/);
  assert.match(source, /maxContentLength:\s*maxResponseBytes/);
  assert.match(source, /RESPONSE_BODY_TOO_LARGE/);
  assert.doesNotMatch(source, /rejectUnauthorized\s*:\s*false/);
});

test("runtime source contains no TLS verification bypass", () => {
  const root = require("node:path").join(__dirname, "..", "src");
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const path = require("node:path").join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".js")) files.push(path);
    }
  };
  visit(root);
  for (const file of files) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /rejectUnauthorized\s*:\s*false/, file);
  }
});

test("TLS diagnostics classify certificate rejection without accepting it", () => {
  assert.equal(
    tlsVerificationError({ code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }),
    true
  );
  assert.equal(
    tlsVerificationError({ code: "ERR_TLS_CERT_ALTNAME_INVALID" }),
    true
  );
  assert.equal(tlsVerificationError({ code: "ECONNRESET" }), false);
  assert.equal(tlsVerificationError(new Error("certificate wording only")), false);
});

test("runtime provider traffic cannot bypass the safe request layer", () => {
  const roots = [
    require("node:path").join(__dirname, "..", "src", "providers"),
    require("node:path").join(__dirname, "..", "src", "routes")
  ];
  for (const root of roots) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
      const file = require("node:path").join(root, entry.name);
      assert.doesNotMatch(fs.readFileSync(file, "utf8"), /axios\.(?:get|post|request)\s*\(/, file);
    }
  }
});
