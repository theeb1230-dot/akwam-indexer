const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_EPISODES = Object.freeze([1, 2, 3, 4, 5, 6, 7]);
const SUCCESS_STATUSES = new Set(["healthy", "success"]);

function sameCandidate(attempt, source) {
  return attempt.provider === source.provider &&
    (attempt.server || null) === (source.server || null) &&
    attempt.type === source.type;
}

function validateEpisode(item) {
  const failures = [];
  if (item.status !== "ready") failures.push("PLAYBACK_NOT_READY");
  if (item.canonical_mapping?.season !== 1 || item.canonical_mapping?.episode !== item.episode) {
    failures.push("CANONICAL_MAPPING_INVALID");
  }
  if (!Array.isArray(item.attempts) || item.attempts.length === 0) failures.push("CANDIDATE_ATTEMPTS_MISSING");
  for (const attempt of item.attempts || []) {
    if (!SUCCESS_STATUSES.has(attempt.status) && !attempt.reason) failures.push("FAILURE_CLASSIFICATION_MISSING");
  }

  const source = item.selected_source;
  if (!source) {
    failures.push("SELECTED_FALLBACK_MISSING");
    return failures;
  }

  const selectedAttempt = (item.attempts || []).find(attempt =>
    SUCCESS_STATUSES.has(attempt.status) && sameCandidate(attempt, source)
  );
  if (!selectedAttempt) failures.push("SELECTED_FALLBACK_NOT_SUCCESSFUL");

  if (source.type === "embed") {
    const verification = item.playback_verification || source.playback_verification;
    if (!verification?.playing || Number(verification.max_current_time || 0) < 2) {
      failures.push("EMBED_PLAYBACK_NOT_VERIFIED");
    }
  } else if (!["direct_mp4", "hls", "direct"].includes(source.type)) {
    failures.push("SELECTED_SOURCE_TYPE_INVALID");
  } else if (
    source.validation_scope !== "media_bytes_verified" ||
    selectedAttempt?.validation_scope !== "media_bytes_verified" ||
    Number(selectedAttempt?.sampled_bytes || 0) < 1
  ) {
    failures.push("DIRECT_MEDIA_BYTES_NOT_VERIFIED");
  }
  return failures;
}

function validateLiveMatrix(report) {
  if (!report || typeof report !== "object") throw new Error("LIVE_MATRIX_REPORT_REQUIRED");
  const byEpisode = new Map((report.episodes || []).map(item => [Number(item.episode), item]));
  const episodes = REQUIRED_EPISODES.map(episode => {
    const item = byEpisode.get(episode);
    return { episode, failures: item ? validateEpisode(item) : ["EPISODE_MISSING"] };
  });
  const duplicates = (report.episodes || []).length !== byEpisode.size;
  const targetValid = report.title === "Lucky" && Number(report.season) === 1;
  return {
    schema_version: 1,
    gate: "live_playback_matrix",
    generated_at: new Date().toISOString(),
    required_episodes: REQUIRED_EPISODES,
    status: targetValid && !duplicates && episodes.every(item => item.failures.length === 0) ? "passed" : "failed",
    target_valid: targetValid,
    duplicate_episode_rows: duplicates,
    episodes,
    claims: {
      http_reachability_alone_accepted: false,
      embed_requires_current_time_seconds: 2,
      all_lucky_episodes_verified: !duplicates && episodes.every(item => item.failures.length === 0)
    }
  };
}

function main() {
  const sourcePath = path.resolve(process.argv[2] || process.env.LIVE_REPORT_PATH || "artifacts/live-playback/report.json");
  const outputPath = path.resolve(process.env.LIVE_MATRIX_RESULT_PATH || "artifacts/live-playback/validation.json");
  const result = validateLiveMatrix(JSON.parse(fs.readFileSync(sourcePath, "utf8")));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  if (result.status !== "passed") process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { REQUIRED_EPISODES, validateEpisode, validateLiveMatrix };
