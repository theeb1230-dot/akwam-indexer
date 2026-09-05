const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");

const { corsOriginList, requestBodyLimit, securityConfig, tokensEqual } = require("../src/config/security");
const { secretValue } = require("../src/config/secret");
const adminAuth = require("../src/middleware/admin-auth");
const {
  authentication,
  bearerToken,
  corsPolicy,
  errorEnvelope,
  errorHandler,
  inputGuard,
  publicClientRequest,
  rateLimiter,
  requestContext,
  validProviderTarget
} = require("../src/middleware/security");
const {
  boundedTimeout,
  enforceResponseSize,
  normalizeRequestError,
  pinPublicHost,
  privateAddress,
  safeGet,
  validateResolvedRecords
} = require("../src/services/safe-media-request");
const {
  tlsVerificationError
} = require("../src/services/tls-diagnostics");
const logger = require("../src/observability/logger");

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    getHeader(name) { return this.headers[name]; },
    end() { this.ended = true; return this; }
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


test("API token secret files are bounded and reject ambiguous sources", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "theeb-token-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const token = "a".repeat(40);
  const file = path.join(directory, "api-token");
  fs.writeFileSync(file, token + "\n", { mode: 0o600 });

  assert.equal(secretValue({ THEEB_API_TOKEN_FILE: file }, "THEEB_API_TOKEN"), token);
  assert.equal(
    securityConfig({
      NODE_ENV: "production",
      THEEB_API_TOKEN_FILE: file
    }).apiToken,
    token
  );
  assert.throws(
    () => secretValue({
      THEEB_API_TOKEN: token,
      THEEB_API_TOKEN_FILE: file
    }, "THEEB_API_TOKEN"),
    /THEEB_API_TOKEN_SOURCE_AMBIGUOUS/
  );

  const empty = path.join(directory, "empty");
  fs.writeFileSync(empty, "");
  assert.throws(
    () => secretValue({ THEEB_API_TOKEN_FILE: empty }, "THEEB_API_TOKEN"),
    /INVALID_THEEB_API_TOKEN_FILE/
  );

  const oversized = path.join(directory, "oversized");
  fs.writeFileSync(oversized, "x".repeat(4097));
  assert.throws(
    () => secretValue({ THEEB_API_TOKEN_FILE: oversized }, "THEEB_API_TOKEN"),
    /INVALID_THEEB_API_TOKEN_FILE/
  );
});

test("admin authentication supports file secrets and fails closed on ambiguity", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "theeb-admin-token-"));
  const file = path.join(directory, "admin-token");
  const token = "b".repeat(40);
  fs.writeFileSync(file, token + "\n", { mode: 0o600 });

  const beforeDirect = process.env.ADMIN_READ_TOKEN;
  const beforeFile = process.env.ADMIN_READ_TOKEN_FILE;
  t.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    if (beforeDirect === undefined) delete process.env.ADMIN_READ_TOKEN;
    else process.env.ADMIN_READ_TOKEN = beforeDirect;
    if (beforeFile === undefined) delete process.env.ADMIN_READ_TOKEN_FILE;
    else process.env.ADMIN_READ_TOKEN_FILE = beforeFile;
  });

  delete process.env.ADMIN_READ_TOKEN;
  process.env.ADMIN_READ_TOKEN_FILE = file;

  let continued = false;
  adminAuth(
    { get(name) { return name === "authorization" ? "Bearer " + token : ""; } },
    response(),
    () => { continued = true; }
  );
  assert.equal(continued, true);

  process.env.ADMIN_READ_TOKEN = token;
  const ambiguous = response();
  adminAuth(
    { get() { return ""; } },
    ambiguous,
    () => assert.fail("ambiguous admin token source must fail closed")
  );
  assert.equal(ambiguous.statusCode, 503);
  assert.equal(ambiguous.body.error, "ADMIN_API_DISABLED");
});


test("public client API allowlist is explicit while legacy and admin routes remain protected", () => {
  assert.equal(publicClientRequest({ method: "GET", path: "/livez" }), true);
  assert.equal(publicClientRequest({ method: "GET", path: "/readyz" }), true);
  assert.equal(publicClientRequest({ method: "GET", path: "/api" }), true);
  assert.equal(publicClientRequest({ method: "GET", path: "/v1/search" }), true);
  assert.equal(publicClientRequest({ method: "GET", path: "/v1/series/1" }), true);
  assert.equal(publicClientRequest({ method: "GET", path: "/v1/series/1/episodes" }), true);
  assert.equal(publicClientRequest({ method: "GET", path: "/v1/episodes/1/download-options" }), true);
  assert.equal(publicClientRequest({ method: "POST", path: "/v1/playback/sessions" }), true);
  assert.equal(publicClientRequest({ method: "POST", path: "/v1/playback/sessions/session-1/feedback" }), true);
  assert.equal(publicClientRequest({ method: "POST", path: "/api/import/akwam" }), false);
  assert.equal(publicClientRequest({ method: "GET", path: "/api/providers" }), false);
  assert.equal(publicClientRequest({ method: "GET", path: "/internal/admin/metrics" }), false);
  assert.equal(publicClientRequest({ method: "DELETE", path: "/v1/playback/sessions/session-1" }), false);
  assert.equal(publicClientRequest({ method: "POST", path: "/v1/search" }), false);
});

test("authentication permits public client search but protects legacy APIs", () => {
  const config = { authRequired: true, apiToken: "x".repeat(32) };

  let continued = false;
  authentication(config)(
    {
      method: "GET",
      path: "/v1/search",
      originalUrl: "/v1/search?q=theeb",
      headers: {}
    },
    response(),
    () => { continued = true; }
  );
  assert.equal(continued, true);

  const protectedResponse = response();
  authentication(config)(
    {
      method: "GET",
      path: "/api/providers",
      originalUrl: "/api/providers",
      headers: {}
    },
    protectedResponse,
    () => assert.fail("legacy provider API must remain authenticated")
  );
  assert.equal(protectedResponse.statusCode, 401);
  assert.equal(protectedResponse.body.error, "UNAUTHORIZED");
});

test("request context emits baseline browser security headers", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const res = response();
    let continued = false;
    requestContext(
      {
        secure: true,
        headers: {},
      },
      res,
      () => { continued = true; }
    );

    assert.equal(continued, true);
    assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
    assert.equal(res.headers["Referrer-Policy"], "no-referrer");
    assert.equal(res.headers["X-Frame-Options"], "DENY");
    assert.equal(res.headers["Cross-Origin-Opener-Policy"], "same-origin");
    assert.equal(
      res.headers["Permissions-Policy"],
      "camera=(), microphone=(), geolocation=()"
    );
    assert.equal(
      res.headers["Strict-Transport-Security"],
      "max-age=31536000; includeSubDomains"
    );
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("HSTS is never emitted on insecure requests", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const res = response();
    requestContext(
      {
        secure: false,
        headers: {},
      },
      res,
      () => {}
    );
    assert.equal(res.headers["Strict-Transport-Security"], undefined);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("CORS origins are normalized and invalid entries fail closed", () => {
  assert.deepEqual(
    corsOriginList("https://app.example, https://app.example, http://localhost:3000"),
    ["https://app.example", "http://localhost:3000"]
  );
  assert.throws(() => corsOriginList("https://user:pass@app.example"), /INVALID_CORS_ORIGIN/);
  assert.throws(() => corsOriginList("https://app.example/path"), /INVALID_CORS_ORIGIN/);
  assert.deepEqual(
    securityConfig({ THEEB_CORS_ORIGINS: "https://app.example" }).corsOrigins,
    ["https://app.example"]
  );
});

test("CORS policy allows same-origin and configured origins but rejects others", () => {
  const middleware = corsPolicy({ corsOrigins: ["https://app.example"] });

  let continued = false;
  const same = response();
  middleware(
    {
      method: "GET",
      protocol: "https",
      headers: { origin: "https://api.example", host: "api.example" },
      get(name) { return name === "host" ? "api.example" : undefined; }
    },
    same,
    () => { continued = true; }
  );
  assert.equal(continued, true);
  assert.equal(same.headers["Access-Control-Allow-Origin"], "https://api.example");

  continued = false;
  const allowed = response();
  middleware(
    {
      method: "GET",
      protocol: "https",
      headers: { origin: "https://app.example", host: "api.example" },
      get(name) { return name === "host" ? "api.example" : undefined; }
    },
    allowed,
    () => { continued = true; }
  );
  assert.equal(continued, true);
  assert.equal(allowed.headers["Access-Control-Allow-Origin"], "https://app.example");

  const denied = response();
  middleware(
    {
      method: "GET",
      protocol: "https",
      headers: { origin: "https://evil.example", host: "api.example" },
      get(name) { return name === "host" ? "api.example" : undefined; }
    },
    denied,
    () => assert.fail("disallowed origin must not continue")
  );
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.error, "CORS_ORIGIN_DENIED");

  const preflight = response();
  middleware(
    {
      method: "OPTIONS",
      protocol: "https",
      headers: { origin: "https://app.example", host: "api.example" },
      get(name) { return name === "host" ? "api.example" : undefined; }
    },
    preflight,
    () => assert.fail("preflight must terminate in CORS middleware")
  );
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.ended, true);
  assert.equal(preflight.headers["Access-Control-Allow-Methods"], "GET, POST, OPTIONS");
  assert.equal(preflight.headers["Vary"], "Origin");
});



test("PWA bootstrap assets bypass long static cache", () => {
  const { setWebAssetHeaders } = require("../src/server");
  for (const file of ["index.html", "service-worker.js", "app.webmanifest"]) {
    const res = response();
    setWebAssetHeaders(res, "/tmp/web/" + file);
    assert.equal(res.headers["Cache-Control"], "no-cache", file);
  }

  const asset = response();
  setWebAssetHeaders(asset, "/tmp/web/assets/app-icon.svg");
  assert.equal(asset.headers["Cache-Control"], undefined);
});

test("public PWA shell is served before API authentication", () => {
  const source = fs.readFileSync(require.resolve("../src/server"), "utf8");
  const staticIndex = source.indexOf("app.use(express.static");
  const authIndex = source.indexOf("app.use(authentication(security))");
  const v1Index = source.indexOf('app.use("/v1", v1Router)');
  assert.ok(staticIndex >= 0, "static middleware must exist");
  assert.ok(authIndex > staticIndex, "PWA shell must be reachable before Bearer auth");
  assert.ok(v1Index > authIndex, "versioned client API stays behind authentication so only explicit public routes can bypass it");
  for (const asset of [
    "web/app.webmanifest",
    "web/service-worker.js",
    "web/offline.html",
    "web/index.html"
  ]) {
    assert.equal(fs.existsSync(require("node:path").join(__dirname, "..", asset)), true, asset);
  }
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


test("safe request timeouts and cancellation use stable error codes", async () => {
  assert.equal(boundedTimeout(undefined), 20000);
  assert.equal(boundedTimeout(15000), 15000);
  assert.throws(() => boundedTimeout(999), /INVALID_REQUEST_TIMEOUT/);
  assert.throws(() => boundedTimeout(60001), /INVALID_REQUEST_TIMEOUT/);

  assert.equal(normalizeRequestError({ code: "ECONNABORTED" }).code, "REQUEST_TIMEOUT");
  assert.equal(normalizeRequestError({ code: "ETIMEDOUT" }).code, "REQUEST_TIMEOUT");
  assert.equal(normalizeRequestError({ code: "ERR_CANCELED" }).code, "REQUEST_CANCELLED");
  assert.equal(normalizeRequestError({ name: "AbortError" }).code, "REQUEST_CANCELLED");

  await assert.rejects(
    () => safeGet("https://provider.test/", {}, {
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      request: async (_url, config) => {
        assert.equal(config.timeout, 20000);
        const error = new Error("socket took too long");
        error.code = "ECONNABORTED";
        throw error;
      }
    }),
    error => error.code === "REQUEST_TIMEOUT"
  );

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => safeGet("https://provider.test/", { signal: controller.signal }, {
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      request: async (_url, config) => {
        assert.equal(config.signal.aborted, true);
        const error = new Error("cancelled");
        error.code = "ERR_CANCELED";
        throw error;
      }
    }),
    error => error.code === "REQUEST_CANCELLED"
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

test("provider watch route validates both caller-controlled targets before provider resolution", () => {
  const source = fs.readFileSync(require.resolve("../src/server"), "utf8");
  const routeStart = source.indexOf('"/api/providers/:provider/watch/:watchId/:episodeId"');
  const routeEnd = source.indexOf("/*\n * =========================================================\n * IMPORT", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, "provider watch route must exist");
  const route = source.slice(routeStart, routeEnd);
  const watchGuard = route.indexOf("validProviderTarget(provider, req.params.watchId)");
  const episodeGuard = route.indexOf("validProviderTarget(provider, req.params.episodeId)");
  const providerCall = route.indexOf("provider.getWatchInfo(");
  assert.ok(watchGuard >= 0, "watchId must be restricted to the provider target boundary");
  assert.ok(episodeGuard >= 0, "episodeId must be restricted to the provider target boundary");
  assert.ok(providerCall > watchGuard && providerCall > episodeGuard, "target validation must happen before provider resolution");
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

test("internal HTTP errors log only bounded structured metadata", () => {
  const originalError = logger.error;
  let captured;
  logger.error = (event, fields) => {
    captured = { event, fields };
  };

  try {
    const req = { requestId: "request-12345678" };
    const res = response();
    const error = new Error("upstream https://secret.invalid/?token=super-secret");
    error.code = "UPSTREAM_FAILURE";
    errorHandler(error, req, res, () => {});

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, "INTERNAL_ERROR");
    assert.deepEqual(captured, {
      event: "http_request_failed",
      fields: {
        request_id: "request-12345678",
        error_code: "UPSTREAM_FAILURE",
        error_name: "Error"
      }
    });
    assert.doesNotMatch(JSON.stringify(captured), /secret\.invalid|super-secret|token=/);
  } finally {
    logger.error = originalError;
  }
});

test("unsafe error metadata is replaced before logging", () => {
  const originalError = logger.error;
  let captured;
  logger.error = (event, fields) => {
    captured = { event, fields };
  };

  try {
    const res = response();
    errorHandler(
      { name: "Error token=abc", code: "https://secret.invalid/?token=abc" },
      { requestId: "bad request id with spaces" },
      res,
      () => {}
    );
    assert.deepEqual(captured.fields, {
      request_id: "unknown",
      error_code: "UNEXPECTED_ERROR",
      error_name: "Error"
    });
  } finally {
    logger.error = originalError;
  }
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

test("HTTP routes never write raw errors directly to console", () => {
  const root = path.join(__dirname, "..", "src", "routes");
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const file = path.join(root, entry.name);
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /console\.error\s*\(/, file);
  }
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
