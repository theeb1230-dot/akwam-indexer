const db = require("../db/schema");

function candidateKey(candidate) {
  return [
    candidate.provider,
    candidate.episode_id,
    candidate.watch_id,
    candidate.server || "",
    candidate.type,
    candidate.quality || ""
  ].map(value =>
    String(value || "")
  ).join("|");
}

function getHealth(candidate) {
  return db.prepare(`
    SELECT *
    FROM playback_health
    WHERE candidate_key = ?
  `).get(candidateKey(candidate)) || null;
}

function circuitOpen(candidate, now = Date.now()) {
  const health =
    getHealth(candidate);

  if (
    !health?.circuit_open_until
  ) {
    return false;
  }

  return (
    Date.parse(
      health.circuit_open_until
    ) > now
  );
}

function recordResult(
  candidate,
  result,
  options = {}
) {
  const key =
    candidateKey(candidate);

  const current =
    getHealth(candidate);

  const successes =
    Number(
      current?.success_count || 0
    ) +
    (
      result.status === "healthy"
        ? 1
        : 0
    );

  const failures =
    Number(
      current?.failure_count || 0
    ) +
    (
      result.status === "healthy"
        ? 0
        : 1
    );

  const consecutiveFailures =
    result.status === "healthy"
      ? 0
      : Number(
          current
            ?.consecutive_failures ||
          0
        ) + 1;

  const previousAverage =
    Number(
      current?.avg_latency_ms || 0
    );

  const total =
    successes + failures;

  const average =
    Math.round(
      (
        previousAverage *
          Math.max(total - 1, 0) +
        Number(
          result.latency_ms || 0
        )
      ) /
      Math.max(total, 1)
    );

  const threshold =
    Number(
      options.failureThreshold || 5
    );

  const cooldownMs =
    Number(
      options.cooldownMs ||
      5 * 60 * 1000
    );

  const circuitUntil =
    consecutiveFailures >= threshold
      ? new Date(
          Date.now() + cooldownMs
        ).toISOString()
      : result.status === "healthy"
        ? null
        : current
            ?.circuit_open_until ||
          null;

  db.prepare(`
    INSERT INTO playback_health (
      candidate_key, provider, server,
      playback_type, quality,
      success_count, failure_count,
      consecutive_failures,
      avg_latency_ms, last_status,
      last_failure_reason,
      last_success_at, last_failure_at,
      circuit_open_until, updated_at
    )
    VALUES (
      @candidate_key, @provider, @server,
      @playback_type, @quality,
      @success_count, @failure_count,
      @consecutive_failures,
      @avg_latency_ms, @last_status,
      @last_failure_reason,
      @last_success_at, @last_failure_at,
      @circuit_open_until,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(candidate_key)
    DO UPDATE SET
      success_count = excluded.success_count,
      failure_count = excluded.failure_count,
      consecutive_failures =
        excluded.consecutive_failures,
      avg_latency_ms =
        excluded.avg_latency_ms,
      last_status = excluded.last_status,
      last_failure_reason =
        excluded.last_failure_reason,
      last_success_at =
        excluded.last_success_at,
      last_failure_at =
        excluded.last_failure_at,
      circuit_open_until =
        excluded.circuit_open_until,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    candidate_key: key,
    provider:
      candidate.provider,
    server:
      candidate.server || null,
    playback_type:
      candidate.type,
    quality:
      candidate.quality || null,
    success_count: successes,
    failure_count: failures,
    consecutive_failures:
      consecutiveFailures,
    avg_latency_ms: average,
    last_status:
      result.status,
    last_failure_reason:
      result.reason || null,
    last_success_at:
      result.status === "healthy"
        ? new Date().toISOString()
        : current?.last_success_at ||
          null,
    last_failure_at:
      result.status === "healthy"
        ? current?.last_failure_at ||
          null
        : new Date().toISOString(),
    circuit_open_until:
      circuitUntil
  });

  return getHealth(candidate);
}

function scoreCandidate(candidate) {
  const health =
    getHealth(candidate);

  const typeScore = {
    direct_mp4: 35,
    hls: 30,
    direct: 25,
    embed: 15,
    external_player: 5
  }[candidate.type] || 0;

  const qualityScore = {
    "2160p": 20,
    "1080p": 16,
    "720p": 12,
    "480p": 7,
    "360p": 3
  }[
    String(
      candidate.quality || ""
    ).toLowerCase()
  ] || 0;

  if (!health) {
    return (
      50 +
      typeScore +
      qualityScore -
      Number(
        candidate.fallback_order ||
        100
      ) / 10
    );
  }

  const total =
    Number(health.success_count) +
    Number(health.failure_count);

  const successRate =
    total > 0
      ? Number(
          health.success_count
        ) / total
      : 0.5;

  const latencyPenalty =
    Math.min(
      Number(
        health.avg_latency_ms || 0
      ) / 250,
      20
    );

  return (
    typeScore +
    qualityScore +
    successRate * 50 -
    latencyPenalty -
    Number(
      health.consecutive_failures ||
      0
    ) * 8
  );
}

function ranked(candidates) {
  return [...candidates]
    .map(candidate => ({
      ...candidate,
      health_score:
        Math.round(
          scoreCandidate(candidate) *
          100
        ) / 100
    }))
    .sort(
      (a, b) =>
        b.health_score -
        a.health_score
    );
}

module.exports = {
  candidateKey,
  getHealth,
  circuitOpen,
  recordResult,
  scoreCandidate,
  ranked
};
