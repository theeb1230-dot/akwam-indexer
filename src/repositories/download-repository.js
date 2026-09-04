class SqliteDownloadRepository {
  constructor(db) {
    if (!db?.prepare || !db?.transaction) throw new TypeError("SQLITE_DATABASE_REQUIRED");
    this.db = db;
  }

  async getEpisode(id) {
    return this.db.prepare(`
      SELECT ce.*, cs.title AS series_title
      FROM canonical_episodes ce
      JOIN canonical_series cs
        ON cs.id = ce.canonical_series_id
      WHERE ce.id = ?
    `).get(id) || null;
  }

  async listSources(id) {
    return this.db.prepare(`
      SELECT id, canonical_episode_id, provider, provider_episode_id, source_url
      FROM provider_episodes
      WHERE canonical_episode_id = ?
        AND active = 1
      ORDER BY provider, id
    `).all(id);
  }

  async replaceCandidates(source, candidates) {
    const db = this.db;
    db.transaction(() => {
      db.prepare(`
        UPDATE download_candidates
        SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
        WHERE provider_episode_id = ?
      `).run(source.id);

      const save = db.prepare(`
        INSERT INTO download_candidates (
          canonical_episode_id, provider_episode_id, candidate_key,
          provider, download_id, quality, format, status,
          locator_json, metadata_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(candidate_key) DO UPDATE SET
          download_id = excluded.download_id,
          quality = excluded.quality,
          format = excluded.format,
          status = 'active',
          locator_json = excluded.locator_json,
          metadata_json = excluded.metadata_json,
          updated_at = CURRENT_TIMESTAMP
      `);

      for (const candidate of candidates) {
        save.run(
          source.canonical_episode_id,
          source.id,
          candidate.candidate_id,
          candidate.provider,
          candidate.download_id,
          candidate.quality,
          candidate.format,
          JSON.stringify(candidate.locator),
          JSON.stringify(candidate.metadata)
        );
      }
    })();
  }
}

class PostgresDownloadRepository {
  constructor(pool) {
    if (!pool?.connect) throw new TypeError("POSTGRES_POOL_REQUIRED");
    this.pool = pool;
  }

  async getEpisode(id) {
    const result = await this.pool.query(`
      SELECT ce.*, cs.title AS series_title
      FROM canonical_episodes ce
      JOIN canonical_series cs
        ON cs.id = ce.canonical_series_id
      WHERE ce.id = $1
    `, [id]);
    const row = result.rows[0];
    return row ? normalizeRow(row) : null;
  }

  async listSources(id) {
    const result = await this.pool.query(`
      SELECT id, canonical_episode_id, provider, provider_episode_id, source_url
      FROM provider_episodes
      WHERE canonical_episode_id = $1
        AND active = TRUE
      ORDER BY provider, id
    `, [id]);
    return result.rows.map(normalizeRow);
  }

  async replaceCandidates(source, candidates) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        UPDATE download_candidates
        SET status = 'inactive', updated_at = NOW()
        WHERE provider_episode_id = $1
      `, [source.id]);

      for (const candidate of candidates) {
        await client.query(`
          INSERT INTO download_candidates (
            canonical_episode_id, provider_episode_id, candidate_key,
            provider, download_id, quality, format, status,
            locator, metadata, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8::jsonb, $9::jsonb, NOW())
          ON CONFLICT(candidate_key) DO UPDATE SET
            download_id = excluded.download_id,
            quality = excluded.quality,
            format = excluded.format,
            status = 'active',
            locator = excluded.locator,
            metadata = excluded.metadata,
            updated_at = NOW()
        `, [
          source.canonical_episode_id,
          source.id,
          candidate.candidate_id,
          candidate.provider,
          candidate.download_id,
          candidate.quality,
          candidate.format,
          JSON.stringify(candidate.locator),
          JSON.stringify(candidate.metadata)
        ]);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

function normalizeRow(row) {
  if (!row) return row;
  const output = { ...row };
  for (const key of ["id", "canonical_episode_id", "season_number", "episode_number"]) {
    if (output[key] != null) output[key] = Number(output[key]);
  }
  return output;
}

function createDownloadRepository(env = process.env) {
  const { DRIVERS, databaseDriver } = require("../db/config");
  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("../db/postgres");
    return new PostgresDownloadRepository(getPool(env));
  }
  return new SqliteDownloadRepository(require("../db/schema"));
}

module.exports = {
  SqliteDownloadRepository,
  PostgresDownloadRepository,
  createDownloadRepository,
  normalizeRow
};
