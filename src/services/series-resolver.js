const providers =
  require("../providers");

const {
  searchAll
} =
  require("./search-orchestrator");

const {
  saveResolvedSeries
} =
  require("./canonical-store");

function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeProvider(value) {
  return clean(value)
    .toLowerCase();
}

function extractEpisodeNumber(
  episode
) {
  const direct =
    Number(
      episode?.number ??
      episode?.episode_number
    );

  if (
    Number.isInteger(direct) &&
    direct > 0
  ) {
    return direct;
  }

  const text =
    [
      episode?.title,
      episode?.source_url,
      episode?.page_url,
      episode?.id
    ]
      .filter(Boolean)
      .join(" ");

  const patterns = [
    /الحلقة\s*0*(\d+)/i,
    /حلقة\s*0*(\d+)/i,
    /\bepisode\s*0*(\d+)/i,
    /\bep\s*0*(\d+)/i,
    /-e0*(\d+)(?:\/|$)/i
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (match) {
      return Number(
        match[1]
      );
    }
  }

  return null;
}

function extractSeasonNumber(
  episode
) {
  const direct =
    Number(
      episode?.season ??
      episode?.season_number
    );

  if (
    Number.isInteger(direct) &&
    direct > 0
  ) {
    return direct;
  }

  const text =
    [
      episode?.title,
      episode?.source_url,
      episode?.page_url,
      episode?.id
    ]
      .filter(Boolean)
      .join(" ");

  const patterns = [
    /الموسم\s*0*(\d+)/i,
    /\bseason\s*0*(\d+)/i,
    /\bs0*(\d+)e\d+/i
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (match) {
      return Number(
        match[1]
      );
    }
  }

  return 1;
}

function episodeSource(
  providerName,
  episode
) {
  return {
    provider:
      providerName,

    provider_episode_id:
      episode?.id ??
      null,

    title:
      clean(
        episode?.title
      ) ||
      null,

    source_url:
      episode?.source_url ||
      episode?.page_url ||
      (
        typeof episode?.id === "string" &&
        episode.id.startsWith("http")
          ? episode.id
          : null
      ),

    watch_options:
      Array.isArray(
        episode?.watch_options
      )
        ? episode.watch_options
        : []
  };
}

async function resolveProvider(
  searchItem
) {
  const providerName =
    normalizeProvider(
      searchItem.provider
    );

  if (
    !providers.has(
      providerName
    )
  ) {
    return {
      provider:
        providerName,

      ok:
        false,

      error:
        "UNKNOWN_PROVIDER"
    };
  }

  const provider =
    providers.get(
      providerName
    );

  const input =
    searchItem.source_url ||
    searchItem.provider_series_id;

  try {
    const started =
      Date.now();

    const result =
      await provider.getSeries(
        input
      );

    const episodes =
      Array.isArray(
        result?.episodes
      )
        ? result.episodes
        : [];

    return {
      provider:
        providerName,

      ok:
        true,

      duration_ms:
        Date.now() - started,

      source_url:
        result?.source_url ||
        searchItem.source_url ||
        null,

      provider_series_id:
        searchItem.provider_series_id ||
        input,

      series:
        result?.series ||
        {},

      episode_count:
        episodes.length,

      episodes
    };
  } catch (error) {
    return {
      provider:
        providerName,

      ok:
        false,

      source_url:
        searchItem.source_url ||
        null,

      error:
        error.message
    };
  }
}

function mergeEpisodes(
  providerResults
) {
  const groups =
    new Map();

  for (
    const providerResult
    of providerResults
  ) {
    if (
      !providerResult.ok
    ) {
      continue;
    }

    for (
      const episode
      of providerResult.episodes
    ) {
      const number =
        extractEpisodeNumber(
          episode
        );

      if (
        !Number.isInteger(number) ||
        number <= 0
      ) {
        continue;
      }

      const season =
        extractSeasonNumber(
          episode
        );

      const key =
        `${season}:${number}`;

      if (
        !groups.has(key)
      ) {
        groups.set(
          key,
          {
            season,
            number,

            title:
              clean(
                episode.title
              ) ||
              `الحلقة ${number}`,

            sources: []
          }
        );
      }

      const group =
        groups.get(key);

      group.sources.push(
        episodeSource(
          providerResult.provider,
          episode
        )
      );
    }
  }

  return Array
    .from(
      groups.values()
    )
    .map(episode => ({
      ...episode,

      source_count:
        episode.sources.length
    }))
    .sort(
      (a, b) => {
        if (
          a.season !==
          b.season
        ) {
          return (
            a.season -
            b.season
          );
        }

        return (
          a.number -
          b.number
        );
      }
    );
}

function chooseMetadata(
  providerResults,
  fallbackTitle
) {
  const successful =
    providerResults.filter(
      item => item.ok
    );

  const title =
    successful
      .map(
        item =>
          clean(
            item.series?.title
          )
      )
      .find(Boolean) ||
    fallbackTitle ||
    null;

  const image =
    successful
      .map(
        item =>
          item.series?.image
      )
      .find(
        value =>
          value &&
          !String(value)
            .startsWith("data:")
      ) ||
    null;

  const description =
    successful
      .map(
        item =>
          clean(
            item.series
              ?.description
          )
      )
      .find(Boolean) ||
    null;

  return {
    title,
    image,
    description
  };
}

async function resolveSeries({
  query,
  groupKey
}) {
  const search =
    await searchAll(
      query
    );

  let group = null;

  if (groupKey) {
    group =
      search.groups.find(
        item =>
          item.group_key ===
          groupKey
      );
  } else if (
    search.groups.length === 1
  ) {
    group =
      search.groups[0];
  }

  if (!group) {
    const error =
      new Error(
        groupKey
          ? "SEARCH_GROUP_NOT_FOUND"
          : "SEARCH_GROUP_REQUIRED"
      );

    error.code =
      groupKey
        ? "SEARCH_GROUP_NOT_FOUND"
        : "SEARCH_GROUP_REQUIRED";

    error.groups =
      search.groups.map(
        item => ({
          group_key:
            item.group_key,

          title:
            item.title,

          source_count:
            item.source_count
        })
      );

    throw error;
  }

  const providerResults =
    await Promise.all(
      group.providers.map(
        resolveProvider
      )
    );

  const episodes =
    mergeEpisodes(
      providerResults
    );

  const metadata =
    chooseMetadata(
      providerResults,
      group.title
    );

  const resolved = {
    query:
      search.query,

    group_key:
      group.group_key,

    canonical_key:
      group.canonical_key,

    content_type:
      group.content_type,

    title:
      metadata.title,

    image:
      metadata.image,

    description:
      metadata.description,

    searched_providers:
      search.searched_providers,

    matched_sources:
      group.providers.length,

    resolved_sources:
      providerResults.filter(
        item => item.ok
      ).length,

    failed_sources:
      providerResults.filter(
        item => !item.ok
      ).length,

    episode_count:
      episodes.length,

    episodes,

    providers:
      providerResults.map(
        item => ({
          provider:
            item.provider,

          ok:
            item.ok,

          episode_count:
            item.episode_count ??
            0,

          duration_ms:
            item.duration_ms ??
            null,

          source_url:
            item.source_url ??
            null,

          provider_series_id:
            item.provider_series_id ??
            null,

          title:
            item.series?.title ??
            null,

          error:
            item.error ??
            null
        })
      )
  };

  try {
    resolved.canonical =
      await saveResolvedSeries(resolved);
  } catch (error) {
    resolved.canonical = {
      persisted: false,
      error: error.message
    };
  }

  return resolved;
}

module.exports = {
  resolveSeries,
  mergeEpisodes,
  extractEpisodeNumber,
  extractSeasonNumber
};
