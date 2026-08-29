const {
  resolveEpisode
} = require("./episode-resolver");

const {
  validateCandidate
} = require("./candidate-validator");

const {
  retryPolicy
} = require("./failure-classifier");

const health =
  require("./playback-health");

async function executePlayback(
  params,
  options = {}
) {
  const resolve =
    options.resolve ||
    resolveEpisode;

  const validate =
    options.validate ||
    validateCandidate;

  const resolved =
    await resolve(params);

  const plan =
    health.ranked(
      resolved.playback_plan || []
    );

  const attempts = [];

  for (const candidate of plan) {
    if (
      health.circuitOpen(
        candidate
      )
    ) {
      attempts.push({
        provider:
          candidate.provider,
        server:
          candidate.server || null,
        status:
          "skipped",
        reason:
          "CIRCUIT_OPEN"
      });

      continue;
    }

    let attemptNumber = 0;
    let result;

    do {
      attemptNumber++;

      result =
        await validate(
          candidate,
          options.validation || {}
        );

      const storedHealth =
        health.recordResult(
          candidate,
          result,
          options.circuit || {}
        );

      attempts.push({
        provider:
          candidate.provider,
        server:
          candidate.server || null,
        type:
          candidate.type,
        quality:
          candidate.quality || null,
        attempt:
          attemptNumber,
        ...result,
        health: {
          success_count:
            storedHealth.success_count,
          failure_count:
            storedHealth.failure_count,
          consecutive_failures:
            storedHealth
              .consecutive_failures,
          avg_latency_ms:
            storedHealth.avg_latency_ms,
          circuit_open_until:
            storedHealth
              .circuit_open_until
        }
      });

      if (
        result.status === "healthy"
      ) {
        return {
          status: "ready",
          canonical_key:
            resolved.canonical_key,
          title:
            resolved.title,
          season:
            resolved.season,
          episode:
            resolved.episode,
          selected_source:
            candidate,
          attempts_count:
            attempts.length,
          attempts
        };
      }

      const policy =
        retryPolicy(result.reason);

      if (
        attemptNumber >
        policy.retries
      ) {
        break;
      }
    } while (true);
  }

  return {
    status: "unavailable",
    canonical_key:
      resolved.canonical_key,
    title:
      resolved.title,
    season:
      resolved.season,
    episode:
      resolved.episode,
    selected_source: null,
    attempts_count:
      attempts.length,
    attempts
  };
}

module.exports = {
  executePlayback
};
