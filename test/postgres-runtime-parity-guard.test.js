const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(process.cwd(), "src");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith(".js") ? [full] : [];
  });
}

function relative(file) {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}

test("runtime SQLite imports stay behind approved repository boundaries", () => {
  const offenders = [];

  for (const file of walk(root)) {
    const source = fs.readFileSync(file, "utf8");
    if (!source.includes('require("../db/schema")')) continue;

    const name = relative(file);
    const approved =
      name.startsWith("src/repositories/") ||
      name === "src/services/job-manager.js";

    if (!approved) offenders.push(name);
  }

  assert.deepEqual(
    offenders,
    [],
    `Direct SQLite runtime imports escaped repository boundaries: ${offenders.join(", ")}`
  );
});

test("client-facing and worker runtime modules contain no direct SQLite dependency", () => {
  const protectedFiles = [
    "src/routes/v1.js",
    "src/routes/canonical.js",
    "src/routes/library.js",
    "src/routes/refresh.js",
    "src/routes/refresh-all.js",
    "src/services/importer.js",
    "src/services/download-resolver.js",
    "src/services/refresh-scheduler.js",
    "src/services/health-scheduler.js",
    "src/workers/refresh-worker.js",
    "src/workers/health-worker.js"
  ];

  for (const name of protectedFiles) {
    const source = fs.readFileSync(path.join(process.cwd(), name), "utf8");
    assert.doesNotMatch(
      source,
      /require\(["']\.\.\/db\/schema["']\)/,
      `${name} must use a repository contract instead of SQLite directly`
    );
  }
});

test("PostgreSQL runtime migrations include download parity tables", () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), "migrations/postgresql/002_download_runtime_parity.sql"),
    "utf8"
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS playback_options/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS download_candidates/);
  assert.match(migration, /locator JSONB NOT NULL/);
  assert.doesNotMatch(migration, /direct_url|download_url|resolved_url/);
});
