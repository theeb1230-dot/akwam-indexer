const { createHash } = require("node:crypto");

const TABLES = Object.freeze([
  "canonical_series",
  "canonical_keys",
  "provider_series",
  "canonical_episodes",
  "provider_episodes",
  "playback_candidates",
  "playback_health",
  "playback_verification",
  "runtime_jobs",
  "episode_health_schedule"
]);

const COLUMN_MAP = Object.freeze({
  provider_series: { metadata_json: "metadata" },
  provider_episodes: { metadata_json: "metadata" },
  playback_candidates: { locator_json: "locator" },
  runtime_jobs: {
    current_item_json: "current_item",
    result_json: "result",
    errors_json: "errors",
    payload_json: "payload"
  }
});

const JSON_COLUMNS = new Set([
  "metadata_json", "locator_json", "current_item_json",
  "result_json", "errors_json", "payload_json"
]);

const BOOLEAN_COLUMNS = new Set([
  "active", "is_primary", "video_element_discovered", "loadedmetadata",
  "canplay", "playing", "cancel_requested"
]);

function normalizeValue(column, value) {
  if (value == null) return null;
  if (JSON_COLUMNS.has(column)) {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return null; }
  }
  if (BOOLEAN_COLUMNS.has(column)) return Boolean(value);
  return value;
}

function mapRow(table, row) {
  const mapped = {};
  const names = COLUMN_MAP[table] || {};
  for (const [column, value] of Object.entries(row)) {
    mapped[names[column] || column] = normalizeValue(column, value);
  }
  return mapped;
}

function insertStatement(table, row) {
  if (!TABLES.includes(table)) throw new Error(`UNSUPPORTED_TRANSFER_TABLE: ${table}`);
  const columns = Object.keys(row);
  if (!columns.length) throw new Error(`EMPTY_TRANSFER_ROW: ${table}`);
  return {
    sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
    values: columns.map(column => row[column])
  };
}

function checksum(rows) {
  const hash = createHash("sha256");
  for (const row of rows) hash.update(`${JSON.stringify(row)}\n`);
  return hash.digest("hex");
}

module.exports = {
  TABLES,
  mapRow,
  insertStatement,
  checksum
};
