const path = require("node:path");
const Database = require("better-sqlite3");
const { getPool, closePool } = require("../src/db/postgres");
const { TABLES, mapRow, insertStatement, checksum } = require("../src/db/sqlite-postgres-transfer");

async function transfer(options = {}) {
  const sourcePath = path.resolve(options.sourcePath || process.env.DATABASE_PATH || "./data/theeb.sqlite");
  const sqlite = options.sqlite || new Database(sourcePath, { readonly: true, fileMustExist: true });
  const client = options.client || await getPool().connect();
  const ownsSqlite = !options.sqlite;
  const ownsClient = !options.client;
  const report = [];

  try {
    await client.query("BEGIN");
    for (const table of TABLES) {
      const sourceRows = sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => mapRow(table, row));
      const destination = await client.query(`SELECT COUNT(*)::integer AS count FROM ${table}`);
      if (Number(destination.rows[0].count) !== 0) {
        throw new Error(`POSTGRES_TARGET_NOT_EMPTY: ${table}`);
      }
      for (const row of sourceRows) {
        const statement = insertStatement(table, row);
        await client.query(statement.sql, statement.values);
      }
      const verified = await client.query(`SELECT COUNT(*)::integer AS count FROM ${table}`);
      if (Number(verified.rows[0].count) !== sourceRows.length) {
        throw new Error(`TRANSFER_COUNT_MISMATCH: ${table}`);
      }
      report.push({ table, rows: sourceRows.length, checksum: checksum(sourceRows) });
    }

    for (const table of ["canonical_series", "provider_series", "canonical_episodes", "provider_episodes", "playback_candidates"]) {
      await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM ${table}`);
    }
    await client.query("COMMIT");
    return { source: sourcePath, tables: report };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    if (ownsSqlite) sqlite.close();
    if (ownsClient) client.release();
  }
}

if (require.main === module) {
  transfer()
    .then(report => console.log(JSON.stringify(report, null, 2)))
    .catch(error => {
      console.error(JSON.stringify({ error: error.message, code: error.code || null }));
      process.exitCode = 1;
    })
    .finally(closePool);
}

module.exports = { transfer };
