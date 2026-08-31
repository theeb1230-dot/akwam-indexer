const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const Database = require("better-sqlite3");

async function drill() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "theeb-backup-gate-"));
  const source = path.join(directory, "source.sqlite");
  const backup = path.join(directory, "backup.sqlite");
  const restored = path.join(directory, "restored.sqlite");
  try {
    execFileSync(process.execPath, ["-e", [
      "const db = require('./src/db/schema');",
      "const series = db.prepare('INSERT INTO canonical_series (title) VALUES (?)').run('Golden Fixture');",
      "db.prepare('INSERT INTO canonical_keys (canonical_key, canonical_series_id) VALUES (?, ?)').run('series:golden-fixture', series.lastInsertRowid);",
      "db.close();"
    ].join("")], { cwd: path.join(__dirname, "../.."), env: { ...process.env, DATABASE_PATH: source, DATABASE_DRIVER: "sqlite" }, timeout: 15000 });

    const sourceDb = new Database(source, { readonly: true, fileMustExist: true });
    await sourceDb.backup(backup);
    sourceDb.close();
    fs.copyFileSync(backup, restored);

    const restoredDb = new Database(restored, { readonly: true, fileMustExist: true });
    const integrity = restoredDb.pragma("integrity_check", { simple: true });
    const counts = {
      canonical_series: restoredDb.prepare("SELECT COUNT(*) AS count FROM canonical_series").get().count,
      canonical_keys: restoredDb.prepare("SELECT COUNT(*) AS count FROM canonical_keys").get().count
    };
    restoredDb.close();
    if (integrity !== "ok" || counts.canonical_series !== 1 || counts.canonical_keys !== 1) {
      throw new Error("BACKUP_RESTORE_VERIFICATION_FAILED");
    }
    return { gate: "backup_restore", status: "passed", integrity, counts };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  drill().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(JSON.stringify({ gate: "backup_restore", status: "failed", error: error.message }));
    process.exitCode = 1;
  });
}

module.exports = { drill };
