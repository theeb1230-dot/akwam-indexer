const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { databaseUrl } = require("../src/db/postgres");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio || "inherit",
      env: options.env || process.env,
      shell: false
    });
    child.once("error", reject);
    child.once("exit", code => code === 0
      ? resolve()
      : reject(Object.assign(new Error(`${command.toUpperCase()}_FAILED`), { code })));
  });
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("error", reject);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function backup(env = process.env, options = {}) {
  const connectionString = databaseUrl(env);
  const runner = options.run || run;
  const directory = path.resolve(env.BACKUP_DIR || "./backups");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const prefix = `theeb-${safeTimestamp(options.now || new Date())}`;
  const dump = path.join(directory, `${prefix}.dump`);
  const contents = path.join(directory, `${prefix}.contents`);
  const manifest = path.join(directory, `${prefix}.json`);

  await runner(options.pgDump || "pg_dump", [
    "--format=custom", "--no-owner", "--no-acl", "--file", dump
  ], {
    ...options,
    env: { ...(options.env || env), PGDATABASE: connectionString }
  });
  const digest = await sha256(dump);
  const output = fs.openSync(contents, "wx", 0o600);
  try {
    await runner(options.pgRestore || "pg_restore", ["--list", dump], {
      ...options,
      stdio: ["ignore", output, "inherit"]
    });
  } finally {
    fs.closeSync(output);
  }

  const report = {
    format: "pg_dump-custom",
    created_at: new Date().toISOString(),
    dump: path.basename(dump),
    sha256: digest,
    migration_version: env.THEEB_MIGRATION_VERSION || null
  };
  fs.writeFileSync(manifest, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx"
  });
  return { dump, contents, manifest, sha256: digest };
}

if (require.main === module) {
  process.umask(0o077);
  backup().then(result => {
    console.log(JSON.stringify({ status: "completed", ...result }));
  }).catch(error => {
    console.error(JSON.stringify({ status: "failed", error: error.message }));
    process.exitCode = 1;
  });
}

module.exports = { run, safeTimestamp, sha256, backup };
