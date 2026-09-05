const {
  createPlaybackHealthRepository
} = require("../repositories/playback-health-repository");

const repository = createPlaybackHealthRepository();

function candidateKey(candidate) {
  return [
    candidate.provider,
    candidate.episode_id,
    candidate.watch_id,
    candidate.server || "",
    candidate.type,
    candidate.quality || ""
  ].map(value => String(value || "")).join("|");
}

function withRepository(customRepository) {
  const store = customRepository || repository;

  async function getHealth(candidate) {
    return store.getHealth(candidateKey(candidate));
  }

  async function getPlaybackVerification(candidate) {
    return store.getVerification(candidateKey(candidate));
  }

  async function circuitOpen(candidate, now = Date.now()) {
    const health = await getHealth(candidate);
    if (!health?.circuit_open_until) return false;
    return Date.parse(health.circuit_open_until) > now;
  }

  async function recordResult(candidate, result, options = {}) {
    const key = candidateKey(candidate);
    const threshold = Number(options.failureThreshold || 5);
    const cooldownMs = Number(options.cooldownMs || 5 * 60 * 1000);

    if (typeof store.recordHealthResult === "function") {
      return store.recordHealthResult({
        candidate_key: key,
        provider: candidate.provider,
        server: candidate.server || null,
        playback_type: candidate.type,
        quality: candidate.quality || null,
        status: result.status,
        reason: result.reason || null,
        latency_ms: Number(result.latency_ms || 0),
        failure_threshold: threshold,
        cooldown_ms: cooldownMs
      });
    }

    const current = await getHealth(candidate);
    const healthy = result.status === "healthy";
    const successes = Number(current?.success_count || 0) + (healthy ? 1 : 0);
    const failures = Number(current?.failure_count || 0) + (healthy ? 0 : 1);
    const consecutiveFailures = healthy
      ? 0
      : Number(current?.consecutive_failures || 0) + 1;
    const previousAverage = Number(current?.avg_latency_ms || 0);
    const total = successes + failures;
    const average = Math.round(
      (
        previousAverage * Math.max(total - 1, 0) +
        Number(result.latency_ms || 0)
      ) / Math.max(total, 1)
    );

    const nowIso = new Date().toISOString();
    const circuitUntil = consecutiveFailures >= threshold
      ? new Date(Date.now() + cooldownMs).toISOString()
      : healthy
        ? null
        : current?.circuit_open_until || null;

    return store.upsertHealth({
      candidate_key: key,
      provider: candidate.provider,
      server: candidate.server || null,
      playback_type: candidate.type,
      quality: candidate.quality || null,
      success_count: successes,
      failure_count: failures,
      consecutive_failures: consecutiveFailures,
      avg_latency_ms: average,
      last_status: result.status,
      last_failure_reason: result.reason || null,
      last_success_at: healthy ? nowIso : current?.last_success_at || null,
      last_failure_at: healthy ? current?.last_failure_at || null : nowIso,
      circuit_open_until: circuitUntil
    });
  }

  function normalizeRegion(value) {
    const region = String(value || "").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(region) ? region : null;
  }

  function candidateRegions(candidate) {
    const values = Array.isArray(candidate.regions)
      ? candidate.regions
      : candidate.region
        ? [candidate.region]
        : [];
    return [...new Set(values.map(normalizeRegion).filter(Boolean))];
  }

  function regionScore(candidate, preferredRegion) {
    const preferred = normalizeRegion(preferredRegion);
    if (!preferred) return 0;
    const regions = candidateRegions(candidate);
    if (!regions.length) return 0;
    return regions.includes(preferred) ? 12 : -8;
  }

  async function scoreCandidate(candidate, options = {}) {
    const [health, verification] = await Promise.all([
      getHealth(candidate),
      getPlaybackVerification(candidate)
    ]);

    const verificationScore = verification?.health_state === "PLAYBACK_VERIFIED"
      ? 45
      : verification?.health_state === "REACHABLE"
        ? 5
        : verification?.health_state === "DEGRADED"
          ? -20
          : 0;

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
    }[String(candidate.quality || "").toLowerCase()] || 0;

    const localityScore = regionScore(candidate, options.region);

    if (!health) {
      return 50 + typeScore + qualityScore + verificationScore + localityScore -
        Number(candidate.fallback_order || 100) / 10;
    }

    const total = Number(health.success_count) + Number(health.failure_count);
    const successRate = total > 0 ? Number(health.success_count) / total : 0.5;
    const latencyPenalty = Math.min(Number(health.avg_latency_ms || 0) / 250, 20);

    return typeScore + qualityScore + verificationScore + localityScore + successRate * 50 -
      latencyPenalty - Number(health.consecutive_failures || 0) * 8;
  }

  async function ranked(candidates, options = {}) {
    const items = await Promise.all(
      [...candidates].map(async candidate => ({
        ...candidate,
        playback_verification: await getPlaybackVerification(candidate),
        health_score: Math.round((await scoreCandidate(candidate, options)) * 100) / 100
      }))
    );
    return items.sort((a, b) => (
      b.health_score - a.health_score ||
      Number(a.fallback_order || 100) - Number(b.fallback_order || 100) ||
      String(a.provider || "").localeCompare(String(b.provider || "")) ||
      String(a.server || "").localeCompare(String(b.server || ""))
    ));
  }

  return {
    getHealth,
    getPlaybackVerification,
    circuitOpen,
    recordResult,
    scoreCandidate,
    ranked,
    normalizeRegion,
    candidateRegions,
    regionScore
  };
}

module.exports = {
  candidateKey,
  withRepository,
  ...withRepository()
};
