const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { Pool } = require("pg");
const { migrate } = require("../migrate-postgres");

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { encoding: "utf8", env });
  if (result.status !== 0 || result.error) {
    const error = new Error(command.toUpperCase() + "_FAILED");
    error.details = { status: result.status, stderr: result.stderr };
    throw error;
  }
  return result;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function dbUrlWithName(input, name) {
  const url = new URL(input);
  url.pathname = "/" + name;
  return url.toString();
}

async function drill(env = process.env) {
  const sourceUrl = env.GATE_DATABASE_URL;
  if (!sourceUrl) throw new Error("GATE_DATABASE_URL_REQUIRED");

  const adminUrl = dbUrlWithName(sourceUrl, "postgres");
  const restoreDb = "theeb_restore_gate";
  const restoreUrl = dbUrlWithName(sourceUrl, restoreDb);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "theeb-pg-backup-gate-"));
  const dump = path.join(directory, "backup.dump");

  const sourcePool = new Pool({ connectionString: sourceUrl, ssl: false, max: 2 });
  const adminPool = new Pool({ connectionString: adminUrl, ssl: false, max: 1 });
  let restorePool;

  try {
    const sourceClient = await sourcePool.connect();
    try {
      await migrate({ client: sourceClient });
      await sourceClient.query("TRUNCATE TABLE download_candidates, playback_options, playback_candidates, provider_episodes, canonical_episodes, provider_series, canonical_keys, canonical_series, runtime_jobs RESTART IDENTITY CASCADE");
      const series = await sourceClient.query(
        "INSERT INTO canonical_series (title) VALUES ($1) RETURNING id",
        ["Backup Fixture"]
      );
      await sourceClient.query(
        "INSERT INTO canonical_keys (canonical_key, canonical_series_id) VALUES ($1, $2)",
        ["series:backup-fixture", series.rows[0].id]
      );
    } finally {
      sourceClient.release();
    }

    run("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--file",
      dump,
      sourceUrl
    ], env);

    const digest = sha256(dump);
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("BACKUP_CHECKSUM_INVALID");
    run("pg_restore", ["--list", dump], env);

    await adminPool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [restoreDb]
    );
    await adminPool.query('DROP DATABASE IF EXISTS "' + restoreDb + '"');
    await adminPool.query('CREATE DATABASE "' + restoreDb + '"');

    run("pg_restore", [
      "--exit-on-error",
      "--no-owner",
      "--no-acl",
      "--dbname",
      restoreUrl,
      dump
    ], env);

    restorePool = new Pool({ connectionString: restoreUrl, ssl: false, max: 2 });
    const restored = await restorePool.query(
      "SELECT cs.title, ck.canonical_key FROM canonical_series cs JOIN canonical_keys ck ON ck.canonical_series_id = cs.id WHERE cs.title = $1",
      ["Backup Fixture"]
    );
    if (restored.rows.length !== 1 || restored.rows[0].canonical_key !== "series:backup-fixture") {
      throw new Error("POSTGRES_RESTORE_DATA_MISMATCH");
    }

    const directUrls = await restorePool.query(
      "SELECT COUNT(*)::int AS count FROM playback_candidates WHERE locator_json::text ~ '(direct_url|resolved_url|download_url)'"
    );

    if (directUrls.rows[0].count !== 0) {
      throw new Error("POSTGRES_RESTORE_CONTAINS_TEMPORARY_URLS");
    }

    return {
      gate: "backup_restore",
      engine: "postgresql",
      status: "passed",
      backup_sha256: digest,
      restored_fixture_count: restored.rows.length,
      temporary_direct_urls: directUrls.rows[0].count
    };
  } finally {
    if (restorePool) await restorePool.end();
    await sourcePool.end();
    await adminPool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [restoreDb]
    ).catch(() => {});
    await adminPool.query('DROP DATABASE IF EXISTS "' + restoreDb + '"').catch(() => {});
    await adminPool.end();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  drill().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(JSON.stringify({
      gate: "backup_restore",
      engine: "postgresql",
      status: "failed",
      error: error.message,
      details: error.details || null
    }));
    process.exitCode = 1;
  });
}

module.exports = { dbUrlWithName, drill, run, sha256 };
