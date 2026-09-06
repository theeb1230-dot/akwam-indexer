const { DRIVERS, databaseDriver } = require("../db/config");

class SqlitePlaybackSessionRepository {
  constructor(db) {
    if (!db?.prepare) throw new TypeError("SQLITE_DATABASE_REQUIRED");
    this.db = db;
  }

  async episodeExists(id) {
    return Boolean(this.db.prepare("SELECT id FROM canonical_episodes WHERE id = ?").get(id));
  }

  async getSession(id) {
    return this.db.prepare("SELECT * FROM playback_sessions WHERE id = ?").get(id) || null;
  }

  async expireSession(id) {
    this.db.prepare(`
      UPDATE playback_sessions
      SET state = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  }

  async createSession(row) {
    this.db.prepare(`
      INSERT INTO playback_sessions (
        id, canonical_episode_id, state, requested_quality,
        client_platform, client_version, selected_candidate_id,
        created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id,
      row.canonical_episode_id,
      row.state,
      row.requested_quality,
      row.client_platform,
      row.client_version,
      row.selected_candidate_id,
      row.created_at,
      row.updated_at,
      row.expires_at
    );
  }

  async selectCandidate(episodeId, quality) {
    return this.db.prepare(`
      SELECT pc.id, pc.provider, pc.watch_id, pc.quality, pc.playback_type,
        pc.locator_json, pe.provider_episode_id
      FROM playback_candidates pc
      JOIN provider_episodes pe ON pe.id = pc.provider_episode_id
      WHERE pc.canonical_episode_id = ?
        AND pc.status = 'active'
      ORDER BY
        CASE
          WHEN ? != 'auto' AND lower(COALESCE(pc.quality, '')) = lower(?) THEN 0
          WHEN ? = 'auto' THEN 0
          ELSE 1
        END,
        pc.priority ASC,
        pc.id ASC
      LIMIT 1
    `).get(episodeId, quality, quality, quality) || null;
  }

  async selectedCandidate(sessionId) {
    return this.db.prepare(`
      SELECT pc.id, pc.provider, pc.watch_id, pc.quality, pc.playback_type,
        pc.locator_json, pe.provider_episode_id
      FROM playback_sessions ps
      JOIN playback_candidates pc ON pc.id = ps.selected_candidate_id
      JOIN provider_episodes pe ON pe.id = pc.provider_episode_id
      WHERE ps.id = ?
    `).get(sessionId) || null;
  }

  async providerEpisodeSources(episodeId) {
    return this.db.prepare(`
      SELECT pe.id, pe.provider, pe.provider_episode_id, pe.source_url
      FROM provider_episodes pe
      WHERE pe.canonical_episode_id = ? AND pe.active = 1
      ORDER BY pe.id
    `).all(episodeId);
  }

  async upsertResolvedWatchOption(source, option) {
    if (!option?.watch_id) return;
    const type = option.type || "resolver";
    const locator = JSON.stringify({
      provider: source.provider,
      watch_id: String(option.watch_id),
      page_url: option.page_url || null
    });

    this.db.prepare(`
      INSERT INTO playback_options (
        provider_episode_id, provider, watch_id, quality, page_url,
        media_type, can_watch, can_download, priority, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
      ON CONFLICT(provider, watch_id) DO UPDATE SET
        provider_episode_id = excluded.provider_episode_id,
        quality = excluded.quality,
        page_url = excluded.page_url,
        media_type = excluded.media_type,
        can_watch = excluded.can_watch,
        can_download = excluded.can_download,
        priority = excluded.priority,
        status = 'active',
        updated_at = CURRENT_TIMESTAMP
    `).run(
      source.id, source.provider, String(option.watch_id),
      option.quality || null, option.page_url || null, type,
      option.can_watch === false ? 0 : 1,
      option.can_download === true ? 1 : 0,
      Number(option.priority || 100)
    );

    this.db.prepare(`
      INSERT INTO playback_candidates (
        canonical_episode_id, provider_episode_id, provider, watch_id,
        server, playback_type, quality, priority, status, locator_json, updated_at
      ) VALUES (?, ?, ?, ?, '', ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(canonical_episode_id, provider, watch_id, server)
      DO UPDATE SET provider_episode_id=excluded.provider_episode_id,
        playback_type=excluded.playback_type, quality=excluded.quality,
        priority=excluded.priority, status='active',
        locator_json=excluded.locator_json, updated_at=CURRENT_TIMESTAMP
    `).run(
      source.canonical_episode_id, source.id, source.provider,
      String(option.watch_id), type, option.quality || null,
      Number(option.priority || 100), locator
    );
  }

  async providerEpisodeSources(episodeId) {
    const result = await this.pool.query(`
      SELECT pe.id, pe.canonical_episode_id, pe.provider,
        pe.provider_episode_id, pe.source_url
      FROM provider_episodes pe
      WHERE pe.canonical_episode_id = $1 AND pe.active = TRUE
      ORDER BY pe.id
    `, [episodeId]);
    return result.rows;
  }

  async upsertResolvedWatchOption(source, option) {
    if (!option?.watch_id) return;
    const type = option.type || "resolver";
    const locator = {
      provider: source.provider,
      watch_id: String(option.watch_id),
      page_url: option.page_url || null
    };

    await this.pool.query(`
      INSERT INTO playback_options (
        provider_episode_id, provider, watch_id, quality, page_url,
        media_type, can_watch, can_download, priority, status, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',NOW())
      ON CONFLICT(provider, watch_id) DO UPDATE SET
        provider_episode_id=excluded.provider_episode_id,
        quality=excluded.quality, page_url=excluded.page_url,
        media_type=excluded.media_type, can_watch=excluded.can_watch,
        can_download=excluded.can_download, priority=excluded.priority,
        status='active', updated_at=NOW()
    `, [
      source.id, source.provider, String(option.watch_id),
      option.quality || null, option.page_url || null, type,
      option.can_watch !== false, option.can_download === true,
      Number(option.priority || 100)
    ]);

    await this.pool.query(`
      INSERT INTO playback_candidates (
        canonical_episode_id, provider_episode_id, provider, watch_id,
        server, playback_type, quality, priority, status, locator, updated_at
      ) VALUES ($1,$2,$3,$4,'',$5,$6,$7,'active',$8::jsonb,NOW())
      ON CONFLICT(canonical_episode_id, provider, watch_id, server)
      DO UPDATE SET provider_episode_id=excluded.provider_episode_id,
        playback_type=excluded.playback_type, quality=excluded.quality,
        priority=excluded.priority, status='active',
        locator=excluded.locator, updated_at=NOW()
    `, [
      source.canonical_episode_id, source.id, source.provider,
      String(option.watch_id), type, option.quality || null,
      Number(option.priority || 100), JSON.stringify(locator)
    ]);
  }

  async feedbackExists(sessionId, eventId) {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM playback_session_events
      WHERE session_id = ? AND event_id = ?
    `).get(sessionId, eventId));
  }

  async recentFeedbackCount(sessionId, windowStart) {
    return Number(this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM playback_session_events
      WHERE session_id = ? AND received_at >= ?
    `).get(sessionId, windowStart).count);
  }

  async insertFeedback(row) {
    const result = this.db.prepare(`
      INSERT INTO playback_session_events (
        session_id, event_id, event_type, position_seconds,
        error_code, details_json, occurred_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, event_id) DO NOTHING
    `).run(
      row.session_id,
      row.event_id,
      row.event_type,
      row.position_seconds,
      row.error_code,
      row.details_json,
      row.occurred_at,
      row.received_at
    );
    return result.changes > 0;
  }

  async markReady(id) {
    this.db.prepare(`
      UPDATE playback_sessions
      SET state = 'ready', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND state = 'planning'
    `).run(id);
  }

  async markUnavailable(id) {
    this.db.prepare(`
      UPDATE playback_sessions
      SET state = 'unavailable', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND state IN ('planning', 'ready')
    `).run(id);
  }

  async downloadOptions(episodeId) {
    return this.db.prepare(`
      SELECT po.id, po.quality, po.status
      FROM playback_options po
      JOIN provider_episodes pe ON pe.id = po.provider_episode_id
      WHERE pe.canonical_episode_id = ?
        AND po.can_download = 1
        AND po.status = 'active'
      ORDER BY CASE po.quality
        WHEN '1080p' THEN 1 WHEN '720p' THEN 2 WHEN '480p' THEN 3 ELSE 4 END,
        po.priority, po.id
    `).all(episodeId);
  }
}

class PostgresPlaybackSessionRepository {
  constructor(pool) {
    if (!pool?.query) throw new TypeError("POSTGRES_POOL_REQUIRED");
    this.pool = pool;
  }

  async episodeExists(id) {
    const result = await this.pool.query(
      "SELECT id FROM canonical_episodes WHERE id = $1",
      [id]
    );
    return result.rowCount === 1;
  }

  async getSession(id) {
    const result = await this.pool.query(
      "SELECT * FROM playback_sessions WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }

  async expireSession(id) {
    await this.pool.query(`
      UPDATE playback_sessions
      SET state = 'expired', updated_at = NOW()
      WHERE id = $1
    `, [id]);
  }

  async createSession(row) {
    await this.pool.query(`
      INSERT INTO playback_sessions (
        id, canonical_episode_id, state, requested_quality,
        client_platform, client_version, selected_candidate_id,
        created_at, updated_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      row.id,
      row.canonical_episode_id,
      row.state,
      row.requested_quality,
      row.client_platform,
      row.client_version,
      row.selected_candidate_id,
      row.created_at,
      row.updated_at,
      row.expires_at
    ]);
  }

  async selectCandidate(episodeId, quality) {
    const result = await this.pool.query(`
      SELECT pc.id, pc.provider, pc.watch_id, pc.quality, pc.playback_type,
        pc.locator, pe.provider_episode_id
      FROM playback_candidates pc
      JOIN provider_episodes pe ON pe.id = pc.provider_episode_id
      WHERE pc.canonical_episode_id = $1
        AND pc.status = 'active'
      ORDER BY
        CASE
          WHEN $2 <> 'auto' AND lower(COALESCE(pc.quality, '')) = lower($2) THEN 0
          WHEN $2 = 'auto' THEN 0
          ELSE 1
        END,
        pc.priority ASC,
        pc.id ASC
      LIMIT 1
    `, [episodeId, quality]);
    return result.rows[0] || null;
  }

  async selectedCandidate(sessionId) {
    const result = await this.pool.query(`
      SELECT pc.id, pc.provider, pc.watch_id, pc.quality, pc.playback_type,
        pc.locator, pe.provider_episode_id
      FROM playback_sessions ps
      JOIN playback_candidates pc ON pc.id = ps.selected_candidate_id
      JOIN provider_episodes pe ON pe.id = pc.provider_episode_id
      WHERE ps.id = $1
    `, [sessionId]);
    return result.rows[0] || null;
  }

  async feedbackExists(sessionId, eventId) {
    const result = await this.pool.query(`
      SELECT 1 FROM playback_session_events
      WHERE session_id = $1 AND event_id = $2
    `, [sessionId, eventId]);
    return result.rowCount === 1;
  }

  async recentFeedbackCount(sessionId, windowStart) {
    const result = await this.pool.query(`
      SELECT COUNT(*)::int AS count
      FROM playback_session_events
      WHERE session_id = $1 AND received_at >= $2
    `, [sessionId, windowStart]);
    return Number(result.rows[0]?.count || 0);
  }

  async insertFeedback(row) {
    const result = await this.pool.query(`
      INSERT INTO playback_session_events (
        session_id, event_id, event_type, position_seconds,
        error_code, details, occurred_at, received_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
      ON CONFLICT(session_id, event_id) DO NOTHING
      RETURNING id
    `, [
      row.session_id,
      row.event_id,
      row.event_type,
      row.position_seconds,
      row.error_code,
      row.details_json,
      row.occurred_at,
      row.received_at
    ]);
    return result.rowCount === 1;
  }

  async markReady(id) {
    await this.pool.query(`
      UPDATE playback_sessions
      SET state = 'ready', updated_at = NOW()
      WHERE id = $1 AND state = 'planning'
    `, [id]);
  }

  async markUnavailable(id) {
    await this.pool.query(`
      UPDATE playback_sessions
      SET state = 'unavailable', updated_at = NOW()
      WHERE id = $1 AND state IN ('planning', 'ready')
    `, [id]);
  }

  async downloadOptions(episodeId) {
    const result = await this.pool.query(`
      SELECT po.id, po.quality, po.status
      FROM playback_options po
      JOIN provider_episodes pe ON pe.id = po.provider_episode_id
      WHERE pe.canonical_episode_id = $1
        AND po.can_download = TRUE
        AND po.status = 'active'
      ORDER BY CASE po.quality
        WHEN '1080p' THEN 1 WHEN '720p' THEN 2 WHEN '480p' THEN 3 ELSE 4 END,
        po.priority, po.id
    `, [episodeId]);
    return result.rows;
  }
}

function createPlaybackSessionRepository(env = process.env) {
  if (databaseDriver(env) === DRIVERS.POSTGRES) {
    const { getPool } = require("../db/postgres");
    return new PostgresPlaybackSessionRepository(getPool(env));
  }
  return new SqlitePlaybackSessionRepository(require("../db/schema"));
}

module.exports = {
  PostgresPlaybackSessionRepository,
  SqlitePlaybackSessionRepository,
  createPlaybackSessionRepository
};
