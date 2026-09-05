const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "../..");
const outputDirectory = path.join(root, "artifacts/golden-gates");
const gates = ["regression", "security", "providers", "live-contract", "harness-contract", "migrations", "postgres-e2e", "backup-restore", "load", "soak"];

function boundedText(value, limit = 12000) {
  return String(value || "").slice(-limit);
}

function run(options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.GATE_TIMEOUT_MS || 60000);
  const results = [];
  for (const gate of gates) {
    const started = Date.now();
    const command = gate === "postgres-e2e"
      ? ["run", "test:postgres-e2e", "--silent"]
      : ["run", `gate:${gate}`, "--silent"];
    const child = spawnSync("npm", command, {
      cwd: root,
      encoding: "utf8",
      timeout: timeoutMs,
      env: {
        ...process.env,
        THEEB_LIVE_TESTS: "0",
        E2E_POSTGRES_URL:
          gate === "postgres-e2e"
            ? (process.env.E2E_POSTGRES_URL || process.env.GATE_DATABASE_URL || "")
            : process.env.E2E_POSTGRES_URL
      }
    });
    const stdout = boundedText(child.stdout);
    const stderr = boundedText(child.stderr);
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(path.join(outputDirectory, `${gate}.stdout.log`), stdout);
    fs.writeFileSync(path.join(outputDirectory, `${gate}.stderr.log`), stderr);
    const status = child.status === 0 && !child.error ? "passed" : "failed";
    if (status === "failed") {
      console.error(JSON.stringify({
        gate,
        status,
        exit_code: child.status,
        signal: child.signal || null,
        error: child.error?.message || null,
        stdout,
        stderr
      }));
    }
    results.push({
      gate,
      status,
      duration_ms: Date.now() - started,
      exit_code: child.status,
      signal: child.signal || null,
      error: child.error?.message || null,
      evidence: {
        stdout_artifact: `${gate}.stdout.log`,
        stderr_artifact: `${gate}.stderr.log`
      }
    });
  }
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_revision: process.env.GITHUB_SHA || process.env.SOURCE_REVISION || null,
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch
    },
    budgets: {
      subprocess_timeout_ms: timeoutMs,
      load_operations: Number(process.env.GATE_LOAD_OPERATIONS || 2000),
      load_concurrency: Number(process.env.GATE_LOAD_CONCURRENCY || 25),
      soak_cycles: Number(process.env.GATE_SOAK_CYCLES || 10000)
    },
    evidence_scope: "offline_and_local_postgres",
    claims: {
      deterministic_gates_passed: results.every(item => item.status === "passed"),
      live_provider_matrix_passed: false,
      production_configuration_reviewed: false,
      production_backup_restore_passed: false,
      golden_release_approved: false
    },
    status: results.every(item => item.status === "passed") ? "passed" : "failed",
    results
  };
  fs.writeFileSync(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const rows = results.map(item => `| ${item.gate} | ${item.status} | ${item.duration_ms} |`).join("\n");
  fs.writeFileSync(path.join(outputDirectory, "report.md"), `# Theeb Golden Gate Report\n\nDeterministic gates plus isolated local PostgreSQL migration and backup/restore drills. This report does **not** claim live provider playback, production configuration review, production restore, or Golden approval.\n\n| Gate | Status | Duration (ms) |\n|---|---:|---:|\n${rows}\n`);
  return report;
}

if (require.main === module) {
  const report = run();
  console.log(JSON.stringify({ status: report.status, report: "artifacts/golden-gates/report.json" }));
  if (report.status !== "passed") process.exitCode = 1;
}

module.exports = { run, gates };
