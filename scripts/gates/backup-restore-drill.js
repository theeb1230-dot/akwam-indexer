const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const Database = require("better-sqlite3");

function digest(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

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
      "const providerSeries = db.prepare('INSERT INTO provider_series (canonical_series_id, provider, provider_series_id) VALUES (?, ?, ?)').run(series.lastInsertRowid, 'fixture', 'golden');",
      "const episode = db.prepare('INSERT INTO canonical_episodes (canonical_series_id, season_number, episode_number) VALUES (?, 1, 1)').run(series.lastInsertRowid);",
      "const providerEpisode = db.prepare('INSERT INTO provider_episodes (canonical_episode_id, provider_series_id, provider, provider_episode_id) VALUES (?, ?, ?, ?)').run(episode.lastInsertRowid, providerSeries.lastInsertRowid, 'fixture', 'golden-e1');",
      "db.prepare('INSERT INTO playback_candidates (canonical_episode_id, provider_episode_id, provider, watch_id, playback_type, locator_json) VALUES (?, ?, ?, ?, ?, ?)').run(episode.lastInsertRowid, providerEpisode.lastInsertRowid, 'fixture', 'golden-watch', 'direct_mp4', JSON.stringify({provider:'fixture',episode_id:'golden-e1',watch_id:'golden-watch'}));",
      "db.close();"
    ].join("")], { cwd: path.join(__dirname, "../.."), env: { ...process.env, DATABASE_PATH: source, DATABASE_DRIVER: "sqlite" }, timeout: 15000 });

    const sourceDb = new Database(source, { readonly: true, fileMustExist: true });
    await sourceDb.backup(backup);
    sourceDb.close();
    const backupSha256 = digest(backup);
    fs.copyFileSync(backup, restored);
    if (digest(restored) !== backupSha256) throw new Error("BACKUP_CHECKSUM_MISMATCH");

    const restoredDb = new Database(restored, { readonly: true, fileMustExist: true });
    const integrity = restoredDb.pragma("integrity_check", { simple: true });
    const counts = {
      canonical_series: restoredDb.prepare("SELECT COUNT(*) AS count FROM canonical_series").get().count,
      canonical_keys: restoredDb.prepare("SELECT COUNT(*) AS count FROM canonical_keys").get().count,
      playback_candidates: restoredDb.prepare("SELECT COUNT(*) AS count FROM playback_candidates").get().count,
      temporary_direct_urls: restoredDb.prepare("SELECT COUNT(*) AS count FROM playback_candidates WHERE locator_json LIKE '%direct_url%'").get().count
    };
    restoredDb.close();
    if (integrity !== "ok" || counts.canonical_series !== 1 || counts.canonical_keys !== 1 || counts.playback_candidates !== 1 || counts.temporary_direct_urls !== 0) {
      throw new Error("BACKUP_RESTORE_VERIFICATION_FAILED");
    }
    return { gate: "backup_restore", status: "passed", integrity, backup_sha256: backupSha256, counts };
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
