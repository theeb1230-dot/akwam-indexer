const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "../..");
const outputDirectory = path.join(root, "artifacts/golden-gates");
const gates = ["regression", "security", "providers", "migrations", "backup-restore", "load", "soak"];

function run(options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.GATE_TIMEOUT_MS || 60000);
  const results = [];
  for (const gate of gates) {
    const started = Date.now();
    const child = spawnSync("npm", ["run", `gate:${gate}`, "--silent"], {
      cwd: root,
      encoding: "utf8",
      timeout: timeoutMs,
      env: { ...process.env, THEEB_LIVE_TESTS: "0" }
    });
    results.push({
      gate,
      status: child.status === 0 && !child.error ? "passed" : "failed",
      duration_ms: Date.now() - started,
      exit_code: child.status,
      signal: child.signal || null,
      error: child.error?.message || null,
      stdout: child.stdout.trim().slice(-12000),
      stderr: child.stderr.trim().slice(-12000)
    });
  }
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    offline_only: true,
    live_playback_verified: false,
    status: results.every(item => item.status === "passed") ? "passed" : "failed",
    results
  };
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const rows = results.map(item => `| ${item.gate} | ${item.status} | ${item.duration_ms} |`).join("\n");
  fs.writeFileSync(path.join(outputDirectory, "report.md"), `# Theeb Golden Gate Report\n\nOffline deterministic gates only. This report does **not** claim live provider or playback verification.\n\n| Gate | Status | Duration (ms) |\n|---|---:|---:|\n${rows}\n`);
  return report;
}

if (require.main === module) {
  const report = run();
  console.log(JSON.stringify({ status: report.status, report: "artifacts/golden-gates/report.json" }));
  if (report.status !== "passed") process.exitCode = 1;
}

module.exports = { run, gates };
