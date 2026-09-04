const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validate } = require("../scripts/validate-production-config");
const { deploymentBaseUrl } = require("../scripts/deployment-smoke-test");
const { cryptoSafeEqual } = require("../scripts/verify-postgres-backup");
const { databaseUrl } = require("../src/db/postgres");
const { installShutdownHandlers } = require("../src/runtime/shutdown");
const { backup } = require("../scripts/backup-postgres");
const { app, runtimeState, startServer } = require("../src/server");

test("production validation requires PostgreSQL and verified TLS", () => {
  assert.deepEqual(validate({
    NODE_ENV: "production",
    THEEB_ROLE: "api",
    DATABASE_DRIVER: "postgres",
    DATABASE_URL: "postgresql://user:password@db.example/theeb",
    PGSSLMODE: "verify-full",
    POSTGRES_RUNTIME_PARITY: "verified"
  }), { role: "api", database: "postgres", tls: "verified" });

  assert.throws(() => validate({
    NODE_ENV: "production",
    THEEB_ROLE: "api",
    DATABASE_DRIVER: "sqlite",
    DATABASE_URL: "postgresql://db.example/theeb",
    PGSSLMODE: "disable"
  }), error => error.details.includes("PRODUCTION_POSTGRES_REQUIRED") &&
    error.details.includes("POSTGRES_TLS_VERIFICATION_REQUIRED"));
});

test("deployment templates contain probes and secret references without credentials", () => {
  const root = path.join(__dirname, "..");
  const api = fs.readFileSync(path.join(root, "deploy/cloud-run/api.service.yaml"), "utf8");
  const migration = fs.readFileSync(path.join(root, "deploy/cloud-run/migration.job.yaml"), "utf8");
  assert.match(api, /path: \/readyz/);
  assert.match(api, /path: \/livez/);
  assert.match(api, /secretKeyRef:/);
  assert.match(migration, /maxRetries: 0/);
  assert.match(api, /run\.googleapis\.com\/execution-environment: gen2/);
  assert.doesNotMatch(`${api}\n${migration}`, /postgresql:\/\//);
  assert.doesNotMatch(`${api}\n${migration}`, /:latest(?:\s|$)/);
});

test("production validation rejects implicit all, unimplemented roles and weak TLS policy", () => {
  const base = {
    NODE_ENV: "production",
    DATABASE_DRIVER: "postgres",
    DATABASE_URL: "postgresql://user:password@db.example/theeb",
    PGSSLMODE: "verify-full",
    POSTGRES_RUNTIME_PARITY: "verified"
  };
  assert.throws(() => validate(base), error =>
    error.details.includes("DEDICATED_RUNTIME_ROLE_REQUIRED"));
  assert.throws(() => validate({ ...base, THEEB_ROLE: "playback-worker" }), error =>
    error.details.includes("THEEB_ROLE_NOT_IMPLEMENTED"));
  assert.throws(() => validate({ ...base, THEEB_ROLE: "api", PGSSLMODE: "require" }), error =>
    error.details.includes("PG_VERIFY_FULL_REQUIRED"));
  assert.throws(() => validate({
    ...base,
    THEEB_ROLE: "api",
    DATABASE_URL: "https://db.example/theeb"
  }), error => error.details.includes("POSTGRES_DATABASE_URL_REQUIRED"));
});

test("production validation remains closed before PostgreSQL runtime parity", () => {
  assert.throws(() => validate({
    NODE_ENV: "production",
    THEEB_ROLE: "api",
    DATABASE_DRIVER: "postgres",
    DATABASE_URL: "postgresql://user:password@db.example/theeb",
    PGSSLMODE: "verify-full"
  }), error => error.details.includes("POSTGRES_RUNTIME_PARITY_NOT_VERIFIED"));
});

test("PostgreSQL credentials can be injected through a mounted secret file", t => {
  const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "theeb-secret-"));
  const secret = path.join(directory, "database-url");
  fs.writeFileSync(secret, "postgresql://user:password@db.example/theeb\n", { mode: 0o600 });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  assert.equal(databaseUrl({ DATABASE_URL_FILE: secret }),
    "postgresql://user:password@db.example/theeb");
  assert.throws(() => databaseUrl({
    DATABASE_URL: "postgresql://one/db",
    DATABASE_URL_FILE: secret
  }), error => error.code === "DATABASE_URL_SOURCE_AMBIGUOUS");

  const oversized = path.join(directory, "oversized");
  fs.writeFileSync(oversized, "x".repeat(16385));
  assert.throws(() => databaseUrl({ DATABASE_URL_FILE: oversized }), error =>
    error.code === "INVALID_DATABASE_URL_FILE");
});

test("container context and worker units exclude secrets and harden credentials", () => {
  const root = path.join(__dirname, "..");
  const ignored = fs.readFileSync(path.join(root, ".dockerignore"), "utf8");
  const units = ["theeb-health-worker.service", "theeb-refresh-worker.service"]
    .map(file => fs.readFileSync(path.join(root, "deploy/oracle", file), "utf8"))
    .join("\n");
  assert.match(ignored, /^\.env\.\*$/m);
  assert.match(ignored, /^data$/m);
  assert.match(ignored, /^backups$/m);
  assert.match(units, /database-url,dst=\/run\/secrets\/database_url,readonly/);
  assert.match(units, /stat -c %%a \/etc\/theeb\/secrets\/database-url/);
  assert.match(units, /stat -c %%u \/etc\/theeb\/secrets\/database-url/);
  assert.match(units, /--cap-drop ALL/);
  assert.match(units, /no-new-privileges:true/);
});

test("deployment smoke URL requires HTTPS outside loopback", () => {
  assert.equal(deploymentBaseUrl({ THEEB_BASE_URL: "https://api.theeb.example/" }).href,
    "https://api.theeb.example/");
  assert.equal(deploymentBaseUrl({ THEEB_BASE_URL: "http://127.0.0.1:8080" }).port, "8080");
  assert.equal(deploymentBaseUrl({ THEEB_BASE_URL: "http://[::1]:8080" }).port, "8080");
  assert.throws(() => deploymentBaseUrl({ THEEB_BASE_URL: "http://api.theeb.example" }),
    error => error.code === "HTTPS_BASE_URL_REQUIRED");
  assert.throws(() => deploymentBaseUrl({ THEEB_BASE_URL: "https://user:pass@api.theeb.example" }),
    error => error.code === "BASE_URL_CREDENTIALS_FORBIDDEN");
  assert.equal(cryptoSafeEqual("abc", "abc"), true);
  assert.equal(cryptoSafeEqual("abc", "abd"), false);
});

test("backup verification rejects paths outside its evidence directory", async () => {
  const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "theeb-verify-"));
  const manifest = path.join(directory, "unsafe.json");
  fs.writeFileSync(manifest, JSON.stringify({
    format: "pg_dump-custom",
    dump: "../outside.dump",
    sha256: "a".repeat(64)
  }));

  try {
    const { verify } = require("../scripts/verify-postgres-backup");
    await assert.rejects(verify(manifest), /INVALID_BACKUP_MANIFEST/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("backup keeps database credentials out of process arguments and emits evidence", async t => {
  const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "theeb-backup-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const url = "postgresql://backup:secret@db.example/theeb";
  const calls = [];
  const runner = async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "pg_dump") {
      const output = args[args.indexOf("--file") + 1];
      fs.writeFileSync(output, "test archive", { mode: 0o600 });
    } else {
      fs.writeSync(options.stdio[1], "archive listing\n");
    }
  };
  const result = await backup({ DATABASE_URL: url, BACKUP_DIR: directory }, {
    run: runner,
    now: new Date("2026-09-01T00:00:00.000Z")
  });
  assert.equal(calls[0].args.includes(url), false);
  assert.equal(calls[0].options.env.PGDATABASE, url);
  assert.equal(fs.existsSync(result.dump), true);
  assert.equal(fs.existsSync(result.contents), true);
  const manifest = JSON.parse(fs.readFileSync(result.manifest, "utf8"));
  assert.equal(manifest.sha256, result.sha256);
  assert.equal(manifest.format, "pg_dump-custom");
});

test("graceful shutdown force-closes connections after its budget", async () => {
  let forced = false;
  const processRef = {
    env: {},
    exitCode: 0,
    once() {}
  };
  const server = {
    stopAcceptingTraffic() {},
    closeIdleConnections() {},
    close() {},
    closeAllConnections() { forced = true; }
  };
  const shutdown = installShutdownHandlers({ processRef, server, timeoutMs: 5 });
  await shutdown("SIGTERM");
  assert.equal(forced, true);
  assert.equal(processRef.exitCode, 1);
});

test("health endpoints distinguish liveness from readiness", async t => {
  runtimeState.acceptingTraffic = false;
  runtimeState.shuttingDown = false;
  const server = startServer({ port: 0, host: "127.0.0.1" });
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();

  assert.equal((await fetch(`http://127.0.0.1:${port}/livez`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 200);
  server.stopAcceptingTraffic();
  assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 503);
});
