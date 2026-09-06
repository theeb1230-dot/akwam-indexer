const {
  createImporterRepository
} = require("../repositories/importer-repository");
const providers = require("../providers");
const jobs = require("./job-manager");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getProvider(providerName) {
  return providers.get(providerName);
}

function extractSeasonNumber(episode, details = {}) {
  const direct = Number(
    episode?.season ??
    episode?.season_number ??
    details?.episode?.season ??
    details?.episode?.season_number
  );
  if (Number.isInteger(direct) && direct > 0) return direct;

  const text = [
    episode?.title,
    episode?.source_url,
    episode?.id,
    details?.episode?.title,
    details?.source_url
  ].filter(Boolean).join(" ");

  for (const pattern of [
    /الموسم\s*0*(\d+)/i,
    /\bseason\s*0*(\d+)/i,
    /-s0*(\d+)-e0*\d+/i,
    /\bs0*(\d+)e0*\d+\b/i
  ]) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return 1;
}

async function importSeries(
  providerName,
  providerSeriesId,
  options = {}
) {
  const provider =
    getProvider(providerName);

  const repository =
    options.repository ||
    createImporterRepository(options.env || process.env);

  const delayMs =
    Number(options.delayMs ?? 500);

  const jobId =
    options.jobId || null;

  const providerTarget =
    options.providerTarget ||
    providerSeriesId;

  const seriesData =
    await provider.getSeries(
      providerTarget
    );

  seriesData.series.content_type =
    options.contentType === "movie"
      ? "movie"
      : (seriesData.series.content_type || "series");

  if (
    seriesData.series.content_type === "movie" &&
    (!Array.isArray(seriesData.episodes) || seriesData.episodes.length === 0)
  ) {
    seriesData.episodes = [{
      id: providerTarget,
      number: 1,
      title: seriesData.series.title,
      source_url: providerTarget
    }];
  }

  const seriesDbId =
    await repository.upsertSeries(
      providerSeriesId,
      seriesData
    );

  const existingIds = new Set(
    await repository.existingEpisodeIds(
      seriesDbId,
      providerName
    )
  );

  const listedIds = (seriesData.episodes || [])
    .map(item => String(item.id));

  const newEpisodeCount = listedIds
    .filter(id => !existingIds.has(id))
    .length;

  const disappearedCount = await repository.reconcileMissingEpisodes(
    seriesDbId,
    providerName,
    listedIds
  );

  if (jobId) {
    await jobs.start(
      jobId,
      seriesData.episodes.length
    );
  }

  let completed = 0;
  let failed = 0;

  const errors = [];
  let cancelled = false;

  for (
    const episode
    of seriesData.episodes
  ) {
    if (jobId && await jobs.isCancellationRequested(jobId)) {
      cancelled = true;
      break;
    }

    if (jobId) {
      await jobs.setCurrentEpisode(
        jobId,
        {
          id:
            String(episode.id),

          number:
            episode.number
        }
      );
    }

    try {
      const details =
        await provider.getEpisode(
          episode.id
        );

      const normalizedEpisode = {
        ...episode,
        season_number: extractSeasonNumber(
          episode,
          details
        )
      };

      const episodeDbId =
        await repository.upsertEpisode(
          seriesDbId,
          normalizedEpisode,
          details
        );

      for (
        const option
        of details.watch_options || []
      ) {
        await repository.upsertWatchOption(
          episodeDbId,
          details.provider,
          option
        );
      }

      completed++;

      if (jobId) {
        await jobs.episodeCompleted(
          jobId
        );
      }

      if (delayMs > 0) {
        await sleep(delayMs);
      }
    } catch (error) {
      failed++;

      const errorData = {
        episode_id:
          String(episode.id),

        episode_number:
          episode.number,

        message:
          error.message
      };

      errors.push(
        errorData
      );

      if (jobId) {
        await jobs.episodeFailed(
          jobId,
          errorData
        );
      }
    }
  }

  const result = {
    status:
      cancelled
        ? "cancelled"
        : failed === 0
        ? "completed"
        : "completed_with_errors",

    provider:
      providerName,

    provider_series_id:
      String(providerSeriesId),

    library_series_id:
      seriesDbId,

    title:
      seriesData.series.title,

    episode_count:
      seriesData.episodes.length,

    new_episode_count:
      newEpisodeCount,

    disappeared_source_count:
      disappearedCount,

    completed,
    failed,
    errors
  };

  if (jobId) {
    if (cancelled) {
      await jobs.cancel(jobId, result);
    } else {
      await jobs.complete(jobId, result);
    }
  }

  return result;
}

async function runImportJob(
  jobId,
  providerName,
  providerSeriesId,
  options = {}
) {
  try {
    return await importSeries(
      providerName,
      providerSeriesId,
      {
        ...options,
        jobId
      }
    );
  } catch (error) {
    await jobs.fail(
      jobId,
      error
    );

    throw error;
  }
}

async function runCli() {
  const providerName =
    process.argv[2] ||
    "akwam";

  const providerSeriesId =
    process.argv[3];

  if (!providerSeriesId) {
    console.log("");
    console.log(
      "❌ الاستخدام:"
    );

    console.log(
      "node src/services/importer.js akwam 2758"
    );

    console.log("");

    console.log(
      "Providers:",
      providers.list().join(", ")
    );

    process.exit(1);
  }

  console.log("");
  console.log(
    "🐺 THEEB IMPORT ENGINE"
  );
  console.log("");

  console.log(
    `Provider: ${providerName}`
  );

  console.log(
    `Series: ${providerSeriesId}`
  );

  console.log("");

  try {
    const result =
      await importSeries(
        providerName,
        providerSeriesId
      );

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    console.log("");
  } catch (error) {
    console.error("");
    console.error(
      "❌ Import failed"
    );

    console.error(
      error.message
    );

    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  importSeries,
  runImportJob,
  getProvider,
  extractSeasonNumber
};
