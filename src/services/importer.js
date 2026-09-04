const db = require("../db/schema");
const providers = require("../providers");
const jobs = require("./job-manager");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getProvider(providerName) {
  return providers.get(providerName);
}

function upsertSeries(providerSeriesId, data) {
  db.prepare(`
    INSERT INTO series (
      provider,
      provider_series_id,
      title,
      description,
      image,
      language,
      quality,
      country,
      year,
      source_url,
      updated_at
    )
    VALUES (
      @provider,
      @provider_series_id,
      @title,
      @description,
      @image,
      @language,
      @quality,
      @country,
      @year,
      @source_url,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(provider, provider_series_id)
    DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      image = excluded.image,
      language = excluded.language,
      quality = excluded.quality,
      country = excluded.country,
      year = excluded.year,
      source_url = excluded.source_url,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    provider: data.provider,
    provider_series_id:
      String(providerSeriesId),

    title:
      data.series.title,

    description:
      data.series.description,

    image:
      data.series.image,

    language:
      data.series.language,

    quality:
      data.series.quality,

    country:
      data.series.country,

    year:
      data.series.year,

    source_url:
      data.source_url
  });

  return db.prepare(`
    SELECT id
    FROM series
    WHERE provider = ?
    AND provider_series_id = ?
  `).get(
    data.provider,
    String(providerSeriesId)
  ).id;
}

function upsertEpisode(
  seriesId,
  episode,
  details
) {
  db.prepare(`
    INSERT INTO episodes (
      series_id,
      provider,
      provider_episode_id,
      episode_number,
      title,
      description,
      image,
      source_url,
      active,
      last_seen_at,
      missing_since,
      updated_at
    )
    VALUES (
      @series_id,
      @provider,
      @provider_episode_id,
      @episode_number,
      @title,
      @description,
      @image,
      @source_url,
      1,
      CURRENT_TIMESTAMP,
      NULL,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(provider, provider_episode_id)
    DO UPDATE SET
      series_id = excluded.series_id,
      episode_number = excluded.episode_number,
      title = excluded.title,
      description = excluded.description,
      image = excluded.image,
      source_url = excluded.source_url,
      active = 1,
      last_seen_at = CURRENT_TIMESTAMP,
      missing_since = NULL,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    series_id:
      seriesId,

    provider:
      details.provider,

    provider_episode_id:
      String(details.episode.id),

    episode_number:
      episode.number,

    title:
      details.episode.title ||
      episode.title,

    description:
      details.episode.description,

    image:
      details.episode.image,

    source_url:
      details.source_url
  });

  return db.prepare(`
    SELECT id
    FROM episodes
    WHERE provider = ?
    AND provider_episode_id = ?
  `).get(
    details.provider,
    String(details.episode.id)
  ).id;
}

function reconcileMissingEpisodes(
  seriesId,
  provider,
  listedIds
) {
  const ids = [...new Set(
    listedIds.map(String)
  )];

  let result;
  if (ids.length === 0) {
    result = db.prepare(`
      UPDATE episodes
      SET active = 0,
          missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE series_id = ? AND provider = ? AND active = 1
    `).run(seriesId, provider);
  } else {
    const placeholders = ids.map(() => "?").join(", ");
    result = db.prepare(`
      UPDATE episodes
      SET active = 0,
          missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE series_id = ? AND provider = ? AND active = 1
        AND provider_episode_id NOT IN (${placeholders})
    `).run(seriesId, provider, ...ids);
  }

  const providerSeries = db.prepare(`
    SELECT ps.id
    FROM provider_series ps
    JOIN series s
      ON s.provider = ps.provider
     AND s.provider_series_id = ps.provider_series_id
    WHERE s.id = ? AND ps.provider = ?
    LIMIT 1
  `).get(seriesId, provider);

  if (providerSeries) {
    if (ids.length === 0) {
      db.prepare(`
        UPDATE provider_episodes
        SET active = 0,
            missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE provider_series_id = ? AND provider = ? AND active = 1
      `).run(providerSeries.id, provider);
    } else {
      const placeholders = ids.map(() => "?").join(", ");
      db.prepare(`
        UPDATE provider_episodes
        SET active = CASE
              WHEN provider_episode_id IN (${placeholders}) THEN 1
              ELSE 0
            END,
            last_seen_at = CASE
              WHEN provider_episode_id IN (${placeholders})
                THEN CURRENT_TIMESTAMP
              ELSE last_seen_at
            END,
            missing_since = CASE
              WHEN provider_episode_id IN (${placeholders}) THEN NULL
              ELSE COALESCE(missing_since, CURRENT_TIMESTAMP)
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE provider_series_id = ? AND provider = ?
      `).run(
        ...ids,
        ...ids,
        ...ids,
        providerSeries.id,
        provider
      );
    }
  }

  return result.changes;
}

function upsertWatchOption(
  episodeDbId,
  provider,
  option
) {
  db.prepare(`
    INSERT INTO watch_options (
      episode_id,
      provider,
      watch_id,
      quality,
      page_url,
      updated_at
    )
    VALUES (
      @episode_id,
      @provider,
      @watch_id,
      @quality,
      @page_url,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(provider, watch_id)
    DO UPDATE SET
      episode_id = excluded.episode_id,
      quality = excluded.quality,
      page_url = excluded.page_url,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    episode_id:
      episodeDbId,

    provider,

    watch_id:
      String(option.watch_id),

    quality:
      option.quality,

    page_url:
      option.page_url
  });
}

async function importSeries(
  providerName,
  providerSeriesId,
  options = {}
) {
  const provider =
    getProvider(providerName);

  const delayMs =
    Number(options.delayMs ?? 500);

  const jobId =
    options.jobId || null;

  const seriesData =
    await provider.getSeries(
      providerSeriesId
    );

  const seriesDbId =
    upsertSeries(
      providerSeriesId,
      seriesData
    );

  const existingIds = new Set(
    db.prepare(`
      SELECT provider_episode_id
      FROM episodes
      WHERE series_id = ? AND provider = ?
    `).all(seriesDbId, providerName)
      .map(item => String(item.provider_episode_id))
  );

  const listedIds = (seriesData.episodes || [])
    .map(item => String(item.id));

  const newEpisodeCount = listedIds
    .filter(id => !existingIds.has(id))
    .length;

  const disappearedCount = reconcileMissingEpisodes(
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

      const episodeDbId =
        upsertEpisode(
          seriesDbId,
          episode,
          details
        );

      for (
        const option
        of details.watch_options || []
      ) {
        upsertWatchOption(
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
  reconcileMissingEpisodes
};
