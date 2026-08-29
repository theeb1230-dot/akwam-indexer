const {
  executePlayback
} = require(
  "../src/services/playback-executor"
);

const episodes = [1, 2, 3, 5, 7];

async function main() {
  const report = {
    title: "Lucky",
    season: 1,
    generated_at:
      new Date().toISOString(),
    validation_contract: {
      direct:
        "media_bytes_verified",
      embed:
        "embed_page_reachable",
      note:
        "Embed reachability is not proof of in-player media startup."
    },
    episodes: []
  };

  for (const episode of episodes) {
    const started = Date.now();

    try {
      const result =
        await executePlayback({
          query: "Lucky",
          groupKey:
            "series:lucky",
          season: 1,
          episode
        });

      report.episodes.push({
        episode,
        status:
          result.status,
        canonical_mapping: {
          canonical_key:
            result.canonical_key,
          season: 1,
          episode
        },
        resolution:
          result.resolution,
        selected_source:
          result.selected_source
            ? {
                provider:
                  result.selected_source
                    .provider,
                server:
                  result.selected_source
                    .server || null,
                type:
                  result.selected_source
                    .type,
                quality:
                  result.selected_source
                    .quality || null,
                validation_scope:
                  result.attempts
                    .at(-1)
                    ?.validation_scope ||
                  null
              }
            : null,
        attempts_count:
          result.attempts_count,
        attempts:
          result.attempts.map(
            attempt => ({
              provider:
                attempt.provider,
              server:
                attempt.server,
              type:
                attempt.type,
              status:
                attempt.status,
              reason:
                attempt.reason || null,
              detail:
                attempt.detail || null,
              http_status:
                attempt.http_status ||
                null,
              content_type:
                attempt.content_type ||
                null,
              sampled_bytes:
                attempt.sampled_bytes ||
                null,
              latency_ms:
                attempt.latency_ms ??
                null,
              validation_scope:
                attempt
                  .validation_scope ||
                null
            })
          ),
        total_latency_ms:
          Date.now() - started
      });
    } catch (error) {
      report.episodes.push({
        episode,
        status: "error",
        error:
          error.message,
        total_latency_ms:
          Date.now() - started
      });
    }
  }

  report.summary = {
    requested:
      report.episodes.length,
    ready:
      report.episodes.filter(
        item =>
          item.status === "ready"
      ).length,
    unavailable:
      report.episodes.filter(
        item =>
          item.status ===
          "unavailable"
      ).length,
    errors:
      report.episodes.filter(
        item =>
          item.status === "error"
      ).length,
    media_bytes_verified:
      report.episodes.filter(
        item =>
          item.selected_source
            ?.validation_scope ===
          "media_bytes_verified"
      ).length,
    embed_pages_reachable:
      report.episodes.filter(
        item =>
          item.selected_source
            ?.validation_scope ===
          "embed_page_reachable"
      ).length
  };

  console.log(
    "THEEB_LIVE_REPORT_START"
  );
  console.log(
    JSON.stringify(
      report,
      null,
      2
    )
  );
  console.log(
    "THEEB_LIVE_REPORT_END"
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
