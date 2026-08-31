const db = require("./database");

/*
 * ============================================================
 * THEEB / QASHT CANONICAL DATABASE
 * ============================================================
 *
 * المرحلة الانتقالية:
 *
 * الجداول القديمة:
 *   series
 *   episodes
 *   watch_options
 *
 * تبقى موجودة حتى ننقل الـImporter والـAPI عليها تدريجيًا.
 *
 * الجداول الجديدة:
 *
 * canonical_series
 *   └── provider_series
 *
 * canonical_episodes
 *   └── provider_episodes
 *       └── playback_options
 *
 * legacy_series_map / legacy_episode_map
 * تستخدم فقط لربط البيانات القديمة بالجديدة أثناء الهجرة.
 * ============================================================
 */

db.exec(`
CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_series_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  image TEXT,
  language TEXT,
  quality TEXT,
  country TEXT,
  year TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_series_id)
);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_episode_id TEXT NOT NULL,
  episode_number INTEGER,
  title TEXT,
  description TEXT,
  image TEXT,
  source_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  missing_since TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_episode_id),

  FOREIGN KEY(series_id)
    REFERENCES series(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS watch_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  watch_id TEXT NOT NULL,
  quality TEXT,
  page_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, watch_id),

  FOREIGN KEY(episode_id)
    REFERENCES episodes(id)
    ON DELETE CASCADE
);


/* ============================================================
 * CANONICAL SERIES
 * العمل الحقيقي داخل قاشط.
 * لا يرتبط بأي Provider محدد.
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS canonical_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  title TEXT NOT NULL,
  original_title TEXT,

  description TEXT,
  image TEXT,

  content_type TEXT NOT NULL DEFAULT 'series',

  language TEXT,
  country TEXT,
  year TEXT,

  status TEXT NOT NULL DEFAULT 'ready',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


/* ============================================================
 * PROVIDER SERIES
 * يمثل وجود نفس العمل لدى مصدر معيّن.
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS canonical_keys (
  canonical_key TEXT PRIMARY KEY,
  canonical_series_id INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(canonical_series_id)
    REFERENCES canonical_series(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  canonical_series_id INTEGER NOT NULL,

  provider TEXT NOT NULL,
  provider_series_id TEXT NOT NULL,

  provider_title TEXT,

  source_url TEXT,

  quality TEXT,

  confidence REAL NOT NULL DEFAULT 1.0,

  is_primary INTEGER NOT NULL DEFAULT 0,

  metadata_json TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(provider, provider_series_id),

  FOREIGN KEY(canonical_series_id)
    REFERENCES canonical_series(id)
    ON DELETE CASCADE
);


/* ============================================================
 * CANONICAL EPISODES
 * الحلقة نفسها بصرف النظر عن المصدر.
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS canonical_episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  canonical_series_id INTEGER NOT NULL,

  season_number INTEGER NOT NULL DEFAULT 1,
  episode_number INTEGER,

  title TEXT,
  description TEXT,
  image TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(
    canonical_series_id,
    season_number,
    episode_number
  ),

  FOREIGN KEY(canonical_series_id)
    REFERENCES canonical_series(id)
    ON DELETE CASCADE
);


/* ============================================================
 * PROVIDER EPISODES
 * نسخة الحلقة لدى كل Provider.
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS provider_episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  canonical_episode_id INTEGER NOT NULL,
  provider_series_id INTEGER,

  provider TEXT NOT NULL,
  provider_episode_id TEXT NOT NULL,

  source_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  missing_since TEXT,

  confidence REAL NOT NULL DEFAULT 1.0,

  metadata_json TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(provider, provider_episode_id),

  FOREIGN KEY(canonical_episode_id)
    REFERENCES canonical_episodes(id)
    ON DELETE CASCADE,

  FOREIGN KEY(provider_series_id)
    REFERENCES provider_series(id)
    ON DELETE SET NULL
);


/* ============================================================
 * PLAYBACK OPTIONS
 *
 * لا نخزن direct_url الدائم هنا لأن الرابط قد يكون مؤقتًا.
 *
 * watch_id + provider يسمحان لـResolver باستخراج رابط جديد
 * لحظة اختيار المستخدم:
 *
 *   مشاهدة
 * أو
 *   تحميل
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS playback_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  provider_episode_id INTEGER NOT NULL,

  provider TEXT NOT NULL,
  watch_id TEXT NOT NULL,

  quality TEXT,

  page_url TEXT,

  media_type TEXT,

  can_watch INTEGER NOT NULL DEFAULT 1,
  can_download INTEGER NOT NULL DEFAULT 1,

  priority INTEGER NOT NULL DEFAULT 100,

  status TEXT NOT NULL DEFAULT 'active',

  last_success_at TEXT,
  last_failure_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(provider, watch_id),

  FOREIGN KEY(provider_episode_id)
    REFERENCES provider_episodes(id)
    ON DELETE CASCADE
);


/* ============================================================
 * MIGRATION MAPS
 *
 * تحفظ العلاقة مع الجداول القديمة.
 * هذا يجعل الترحيل idempotent:
 * تشغيل schema.js أكثر من مرة لن يكرر المحتوى.
 * ============================================================
 */

CREATE TABLE IF NOT EXISTS playback_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_episode_id INTEGER NOT NULL,
  provider_episode_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  watch_id TEXT NOT NULL,
  server TEXT NOT NULL DEFAULT '',
  playback_type TEXT NOT NULL,
  quality TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active',
  locator_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(canonical_episode_id, provider, watch_id, server),
  FOREIGN KEY(canonical_episode_id)
    REFERENCES canonical_episodes(id)
    ON DELETE CASCADE,
  FOREIGN KEY(provider_episode_id)
    REFERENCES provider_episodes(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playback_health (
  candidate_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  server TEXT,
  playback_type TEXT NOT NULL,
  quality TEXT,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER NOT NULL DEFAULT 0,
  last_status TEXT,
  last_failure_reason TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  circuit_open_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_playback_health_provider
ON playback_health(provider, server);

CREATE INDEX IF NOT EXISTS idx_playback_health_circuit
ON playback_health(circuit_open_until);

CREATE TABLE IF NOT EXISTS playback_verification (
  candidate_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  server TEXT,
  embed_status TEXT,
  playback_status TEXT,
  health_state TEXT NOT NULL DEFAULT 'UNKNOWN',
  video_element_discovered INTEGER NOT NULL DEFAULT 0,
  loadedmetadata INTEGER NOT NULL DEFAULT 0,
  canplay INTEGER NOT NULL DEFAULT 0,
  playing INTEGER NOT NULL DEFAULT 0,
  max_current_time REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_playback_verification_health
ON playback_verification(health_state, checked_at);

CREATE TABLE IF NOT EXISTS playback_sessions (
  id TEXT PRIMARY KEY,
  canonical_episode_id INTEGER,
  client_platform TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  selected_candidate_key TEXT,
  first_frame_ms INTEGER,
  buffering_count INTEGER NOT NULL DEFAULT 0,
  stalled_count INTEGER NOT NULL DEFAULT 0,
  fatal_error_code TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_event_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(canonical_episode_id)
    REFERENCES canonical_episodes(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS playback_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  position_seconds REAL,
  error_code TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id)
    REFERENCES playback_sessions(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_playback_events_session
ON playback_events(session_id, occurred_at);

CREATE TABLE IF NOT EXISTS runtime_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  provider TEXT,
  provider_series_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  total INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  current_item_json TEXT,
  result_json TEXT,
  errors_json TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL DEFAULT '{}',
  dedupe_key TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  worker_id TEXT,
  lease_expires_at TEXT,
  available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_runtime_jobs_claim
ON runtime_jobs(status, available_at, lease_expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_runtime_jobs_target
ON runtime_jobs(type, provider, provider_series_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_jobs_active_dedupe
ON runtime_jobs(dedupe_key)
WHERE dedupe_key IS NOT NULL
  AND status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS episode_health_schedule (
  canonical_episode_id INTEGER PRIMARY KEY,
  last_status TEXT,
  last_checked_at TEXT,
  next_check_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_job_id TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(canonical_episode_id)
    REFERENCES canonical_episodes(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_episode_health_due
ON episode_health_schedule(next_check_at);

CREATE TABLE IF NOT EXISTS legacy_series_map (
  legacy_series_id INTEGER PRIMARY KEY,
  canonical_series_id INTEGER NOT NULL,

  FOREIGN KEY(legacy_series_id)
    REFERENCES series(id)
    ON DELETE CASCADE,

  FOREIGN KEY(canonical_series_id)
    REFERENCES canonical_series(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS legacy_episode_map (
  legacy_episode_id INTEGER PRIMARY KEY,
  canonical_episode_id INTEGER NOT NULL,

  FOREIGN KEY(legacy_episode_id)
    REFERENCES episodes(id)
    ON DELETE CASCADE,

  FOREIGN KEY(canonical_episode_id)
    REFERENCES canonical_episodes(id)
    ON DELETE CASCADE
);


/* ============================================================
 * INDEXES
 * ============================================================
 */

CREATE INDEX IF NOT EXISTS idx_series_provider
ON series(provider, provider_series_id);

CREATE INDEX IF NOT EXISTS idx_episodes_series
ON episodes(series_id);

CREATE INDEX IF NOT EXISTS idx_episodes_provider
ON episodes(provider, provider_episode_id);

CREATE INDEX IF NOT EXISTS idx_watch_episode
ON watch_options(episode_id);


CREATE INDEX IF NOT EXISTS idx_canonical_series_title
ON canonical_series(title);

CREATE INDEX IF NOT EXISTS idx_canonical_series_status
ON canonical_series(status);

CREATE INDEX IF NOT EXISTS idx_provider_series_canonical
ON provider_series(canonical_series_id);

CREATE INDEX IF NOT EXISTS idx_provider_series_provider
ON provider_series(provider, provider_series_id);

CREATE INDEX IF NOT EXISTS idx_canonical_episode_series
ON canonical_episodes(canonical_series_id);

CREATE INDEX IF NOT EXISTS idx_canonical_episode_number
ON canonical_episodes(
  canonical_series_id,
  season_number,
  episode_number
);

CREATE INDEX IF NOT EXISTS idx_provider_episode_canonical
ON provider_episodes(canonical_episode_id);

CREATE INDEX IF NOT EXISTS idx_provider_episode_provider
ON provider_episodes(provider, provider_episode_id);

CREATE INDEX IF NOT EXISTS idx_playback_provider_episode
ON playback_options(provider_episode_id);

CREATE INDEX IF NOT EXISTS idx_playback_provider
ON playback_options(provider, watch_id);

CREATE INDEX IF NOT EXISTS idx_playback_status
ON playback_options(status);

CREATE INDEX IF NOT EXISTS idx_playback_candidates_episode
ON playback_candidates(canonical_episode_id, status, priority);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(
    `PRAGMA table_info(${table})`
  ).all();

  if (!columns.some(item => item.name === column)) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  }
}

ensureColumn("episodes", "active", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("episodes", "last_seen_at", "TEXT");
ensureColumn("episodes", "missing_since", "TEXT");
ensureColumn("provider_episodes", "active", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("provider_episodes", "last_seen_at", "TEXT");
ensureColumn("provider_episodes", "missing_since", "TEXT");
ensureColumn("runtime_jobs", "dedupe_key", "TEXT");
ensureColumn("runtime_jobs", "cancel_requested", "INTEGER NOT NULL DEFAULT 0");


/*
 * ============================================================
 * LEGACY -> CANONICAL MIGRATION
 *
 * مهم:
 * لا نحاول الآن دمج مسلسلين متشابهين بالاسم تلقائيًا.
 *
 * كل مسلسل قديم يحصل مؤقتًا على Canonical مستقل.
 *
 * لاحقًا Search Matcher هو المسؤول عن معرفة أن:
 *
 * Akwam: وادي الذئاب
 * Qask:  وادي الذئاب الكمين
 *
 * قد يكونان نفس العمل أو لا.
 *
 * لا نريد تخمينات خطرة أثناء migration.
 * ============================================================
 */

const migrateLegacy = db.transaction(() => {
  const legacySeries = db.prepare(`
    SELECT *
    FROM series
    ORDER BY id
  `).all();

  const getSeriesMap = db.prepare(`
    SELECT canonical_series_id
    FROM legacy_series_map
    WHERE legacy_series_id = ?
  `);

  const insertCanonicalSeries = db.prepare(`
    INSERT INTO canonical_series (
      title,
      description,
      image,
      language,
      country,
      year,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, 'ready')
  `);

  const insertSeriesMap = db.prepare(`
    INSERT OR IGNORE INTO legacy_series_map (
      legacy_series_id,
      canonical_series_id
    )
    VALUES (?, ?)
  `);

  const insertProviderSeries = db.prepare(`
    INSERT OR IGNORE INTO provider_series (
      canonical_series_id,
      provider,
      provider_series_id,
      provider_title,
      source_url,
      quality,
      confidence,
      is_primary
    )
    VALUES (?, ?, ?, ?, ?, ?, 1.0, 1)
  `);

  for (const item of legacySeries) {
    let map = getSeriesMap.get(item.id);

    let canonicalSeriesId;

    if (map) {
      canonicalSeriesId = map.canonical_series_id;
    } else {
      const result = insertCanonicalSeries.run(
        item.title || `Untitled ${item.id}`,
        item.description || null,
        item.image || null,
        item.language || null,
        item.country || null,
        item.year || null
      );

      canonicalSeriesId =
        Number(result.lastInsertRowid);

      insertSeriesMap.run(
        item.id,
        canonicalSeriesId
      );
    }

    insertProviderSeries.run(
      canonicalSeriesId,
      item.provider,
      item.provider_series_id,
      item.title || null,
      item.source_url || null,
      item.quality || null
    );
  }


  const legacyEpisodes = db.prepare(`
    SELECT
      e.*,
      s.provider_series_id
    FROM episodes e

    JOIN series s
      ON s.id = e.series_id

    ORDER BY e.id
  `).all();

  const getEpisodeMap = db.prepare(`
    SELECT canonical_episode_id
    FROM legacy_episode_map
    WHERE legacy_episode_id = ?
  `);

  const getCanonicalSeriesFromLegacy = db.prepare(`
    SELECT canonical_series_id
    FROM legacy_series_map
    WHERE legacy_series_id = ?
  `);

  const getProviderSeries = db.prepare(`
    SELECT id
    FROM provider_series
    WHERE provider = ?
      AND provider_series_id = ?
  `);

  const insertCanonicalEpisode = db.prepare(`
    INSERT INTO canonical_episodes (
      canonical_series_id,
      season_number,
      episode_number,
      title,
      description,
      image
    )
    VALUES (?, 1, ?, ?, ?, ?)
  `);

  const insertEpisodeMap = db.prepare(`
    INSERT OR IGNORE INTO legacy_episode_map (
      legacy_episode_id,
      canonical_episode_id
    )
    VALUES (?, ?)
  `);

  const insertProviderEpisode = db.prepare(`
    INSERT OR IGNORE INTO provider_episodes (
      canonical_episode_id,
      provider_series_id,
      provider,
      provider_episode_id,
      source_url,
      confidence
    )
    VALUES (?, ?, ?, ?, ?, 1.0)
  `);

  for (const episode of legacyEpisodes) {
    let episodeMap =
      getEpisodeMap.get(episode.id);

    let canonicalEpisodeId;

    if (episodeMap) {
      canonicalEpisodeId =
        episodeMap.canonical_episode_id;
    } else {
      const seriesMap =
        getCanonicalSeriesFromLegacy.get(
          episode.series_id
        );

      if (!seriesMap) {
        continue;
      }

      const result =
        insertCanonicalEpisode.run(
          seriesMap.canonical_series_id,
          episode.episode_number ?? null,
          episode.title || null,
          episode.description || null,
          episode.image || null
        );

      canonicalEpisodeId =
        Number(result.lastInsertRowid);

      insertEpisodeMap.run(
        episode.id,
        canonicalEpisodeId
      );
    }

    const providerSeries =
      getProviderSeries.get(
        episode.provider,
        episode.provider_series_id
      );

    insertProviderEpisode.run(
      canonicalEpisodeId,
      providerSeries
        ? providerSeries.id
        : null,
      episode.provider,
      episode.provider_episode_id,
      episode.source_url || null
    );
  }


  /*
   * نقل خيارات التشغيل القديمة.
   */

  const legacyWatch = db.prepare(`
    SELECT
      w.*,
      e.provider_episode_id
    FROM watch_options w

    JOIN episodes e
      ON e.id = w.episode_id

    ORDER BY w.id
  `).all();

  const getProviderEpisode = db.prepare(`
    SELECT id
    FROM provider_episodes
    WHERE provider = ?
      AND provider_episode_id = ?
  `);

  const insertPlayback = db.prepare(`
    INSERT OR IGNORE INTO playback_options (
      provider_episode_id,
      provider,
      watch_id,
      quality,
      page_url,
      media_type,
      can_watch,
      can_download,
      priority,
      status
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      NULL,
      1,
      1,
      100,
      'active'
    )
  `);

  for (const watch of legacyWatch) {
    const providerEpisode =
      getProviderEpisode.get(
        watch.provider,
        watch.provider_episode_id
      );

    if (!providerEpisode) {
      continue;
    }

    insertPlayback.run(
      providerEpisode.id,
      watch.provider,
      watch.watch_id,
      watch.quality || null,
      watch.page_url || null
    );
  }
});

migrateLegacy();


/*
 * ============================================================
 * SUMMARY
 * ============================================================
 */

const stats = {
  legacy_series:
    db.prepare(
      "SELECT COUNT(*) AS count FROM series"
    ).get().count,

  canonical_series:
    db.prepare(
      "SELECT COUNT(*) AS count FROM canonical_series"
    ).get().count,

  provider_series:
    db.prepare(
      "SELECT COUNT(*) AS count FROM provider_series"
    ).get().count,

  legacy_episodes:
    db.prepare(
      "SELECT COUNT(*) AS count FROM episodes"
    ).get().count,

  canonical_episodes:
    db.prepare(
      "SELECT COUNT(*) AS count FROM canonical_episodes"
    ).get().count,

  provider_episodes:
    db.prepare(
      "SELECT COUNT(*) AS count FROM provider_episodes"
    ).get().count,

  legacy_watch_options:
    db.prepare(
      "SELECT COUNT(*) AS count FROM watch_options"
    ).get().count,

  playback_options:
    db.prepare(
      "SELECT COUNT(*) AS count FROM playback_options"
    ).get().count,

  playback_candidates:
    db.prepare(
      "SELECT COUNT(*) AS count FROM playback_candidates"
    ).get().count
};

console.log("✅ Database schema ready");
console.log("🐺 Canonical database ready");
console.log(stats);

module.exports = db;
