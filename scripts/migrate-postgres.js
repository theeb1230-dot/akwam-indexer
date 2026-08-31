const fs = require("node:fs/promises");
const path = require("node:path");
const {
  getPool,
  closePool
} = require("../src/db/postgres");

async function appliedVersions(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const result = await client.query(
    "SELECT version FROM schema_migrations"
  );
  return new Set(result.rows.map(row => row.version));
}

async function migrate(options = {}) {
  const directory = options.directory || path.join(
    process.cwd(),
    "migrations",
    "postgresql"
  );
  const client = options.client || await getPool().connect();
  const ownsClient = !options.client;

  try {
    const applied = await appliedVersions(client);
    const files = (await fs.readdir(directory))
      .filter(file => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
      .sort();
    const executed = [];

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) continue;
      const sql = await fs.readFile(path.join(directory, file), "utf8");
      await client.query(sql);
      executed.push(version);
    }

    return { discovered: files.length, executed };
  } finally {
    if (ownsClient) client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(JSON.stringify({ error: error.message, code: error.code || null }));
      process.exitCode = 1;
    })
    .finally(closePool);
}

module.exports = {
  appliedVersions,
  migrate
};
