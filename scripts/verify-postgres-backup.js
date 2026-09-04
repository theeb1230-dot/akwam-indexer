const fs = require("node:fs");
const path = require("node:path");
const { run, sha256 } = require("./backup-postgres");

async function verify(manifestFile, options = {}) {
  if (!manifestFile) throw new Error("BACKUP_MANIFEST_REQUIRED");
  const absoluteManifest = path.resolve(manifestFile);
  const manifest = JSON.parse(fs.readFileSync(absoluteManifest, "utf8"));
  if (manifest.format !== "pg_dump-custom" ||
      !manifest.dump ||
      path.basename(manifest.dump) !== manifest.dump ||
      !/^[a-f0-9]{64}$/i.test(String(manifest.sha256 || ""))) {
    throw new Error("INVALID_BACKUP_MANIFEST");
  }
  const dump = path.resolve(path.dirname(absoluteManifest), manifest.dump);
  const actual = await sha256(dump);
  if (!cryptoSafeEqual(actual, manifest.sha256)) {
    throw new Error("BACKUP_CHECKSUM_MISMATCH");
  }
  await run(options.pgRestore || "pg_restore", ["--list", dump], options);
  return { status: "verified", dump, sha256: actual };
}

function cryptoSafeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && require("node:crypto").timingSafeEqual(a, b);
}

if (require.main === module) {
  verify(process.argv[2]).then(result => {
    console.log(JSON.stringify(result));
  }).catch(error => {
    console.error(JSON.stringify({ status: "failed", error: error.message }));
    process.exitCode = 1;
  });
}

module.exports = { cryptoSafeEqual, verify };
