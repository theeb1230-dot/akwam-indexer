const { randomUUID } = require("node:crypto");
const { Client } = require("pg");
const { migrate } = require("../migrate-postgres");

function gateConnectionString(env = process.env) {
  const raw = env.GATE_DATABASE_URL;
  if (!raw) throw new Error("GATE_DATABASE_URL_REQUIRED");
  const parsed = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error("GATE_DATABASE_MUST_BE_LOCAL");
  }
  return raw;
}

async function drill(options = {}) {
  const connectionString = options.connectionString || gateConnectionString();
  const schema = `golden_${randomUUID().replaceAll("-", "")}`;
  const client = options.client || new Client({ connectionString, ssl: false });
  const ownsClient = !options.client;
  if (ownsClient) await client.connect();

  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);

    const fresh = await migrate({ client });
    if (!fresh.executed.length) throw new Error("FRESH_MIGRATION_EXECUTED_NOTHING");

    await client.query("INSERT INTO canonical_series(title) VALUES ($1)", ["Golden Existing DB Fixture"]);
    const existing = await migrate({ client });
    if (existing.executed.length !== 0) throw new Error("EXISTING_MIGRATION_NOT_IDEMPOTENT");

    const preserved = await client.query(
      "SELECT COUNT(*)::integer AS count FROM canonical_series WHERE title = $1",
      ["Golden Existing DB Fixture"]
    );
    if (preserved.rows[0].count !== 1) throw new Error("EXISTING_DATA_NOT_PRESERVED");

    const versions = await client.query("SELECT version FROM schema_migrations ORDER BY version");
    return {
      gate: "postgres_migration",
      status: "passed",
      fresh_executed: fresh.executed,
      existing_executed: existing.executed,
      versions: versions.rows.map(row => row.version),
      existing_rows_preserved: preserved.rows[0].count
    };
  } finally {
    await client.query("SET search_path TO public").catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    if (ownsClient) await client.end();
  }
}

if (require.main === module) {
  drill().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(JSON.stringify({ gate: "postgres_migration", status: "failed", error: error.message }));
    process.exitCode = 1;
  });
}

module.exports = { drill, gateConnectionString };
