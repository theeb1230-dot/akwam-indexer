const providers =
  require("../providers");

const {
  resolveSeries
} =
  require("./series-resolver");

function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [
    ...new Set(
      values.filter(Boolean)
    )
  ];
}

function buildPlayUrl(
  provider,
  watchId,
  episodeId,
  quality
) {
  if (
    !provider ||
    !watchId ||
    !episodeId
  ) {
    return null;
  }

  const query =
    quality
      ? `?quality=${encodeURIComponent(quality)}`
      : "";

  return (
    `/play/` +
    `${encodeURIComponent(provider)}/` +
    `${encodeURIComponent(watchId)}/` +
    `${encodeURIComponent(episodeId)}` +
    query
  );
}

function normalizePlaybackSource(source = {}) {
  const directUrl =
    source.direct_url || null;

  const embedUrl =
    source.embed_url ||
    (
      source.type === "embed"
        ? source.url || null
        : null
    );

  const rawType =
    clean(source.type)
      .toLowerCase();

  let type =
    rawType === "embed" || embedUrl
      ? "embed"
      : rawType.includes("mpegurl") ||
          /\.m3u8(?:$|\?)/i.test(directUrl || "")
        ? "hls"
        : rawType.includes("mp4") ||
            /\.mp4(?:$|\?)/i.test(directUrl || "")
          ? "direct_mp4"
          : directUrl
            ? "direct"
            : "external_player";

  return {
    ...source,
    type,
    direct_url:
      directUrl,
    embed_url:
      embedUrl,
    client_url:
      directUrl || embedUrl ||
      source.url || null
  };
}

function buildPlaybackPlan(sources) {
  const typeRank = {
    direct_mp4: 0,
    hls: 1,
    direct: 2,
    embed: 3,
    external_player: 4
  };

  return sources
    .flatMap(source =>
      (source.watch_options || [])
        .flatMap(option =>
          (option.sources || []).map(item => ({
            provider:
              source.provider,
            episode_id:
              source.episode?.id || null,
            watch_id:
              option.watch_id || null,
            quality:
              item.quality ||
              option.quality ||
              null,
            play_url:
              option.play_url || null,
            ...item
          }))
        )
    )
    .sort((a, b) => {
      const typeDifference =
        (typeRank[a.type] ?? 99) -
        (typeRank[b.type] ?? 99);

      if (typeDifference !== 0) {
        return typeDifference;
      }

      return (
        Number(a.priority || 999) -
        Number(b.priority || 999)
      );
    });
}

async function inspectWatchOption({
  providerName,
  provider,
  episodeId,
  option
}) {
  const watchId =
    option?.watch_id ??
    option?.id ??
    null;

  const quality =
    option?.quality ??
    null;

  if (
    !watchId ||
    typeof provider.getWatchInfo !==
      "function"
  ) {
    return {
      watch_id:
        watchId,

      quality,

      page_url:
        option?.page_url ??
        null,

      play_url:
        null,

      sources: []
    };
  }

  try {
    const info =
      await provider.getWatchInfo(
        watchId,
        episodeId
      );

    const rawSources =
      Array.isArray(info?.sources)
        ? info.sources
        : Array.isArray(info?.watch_options)
          ? info.watch_options
          : [];

    const sources =
      rawSources.map(
        normalizePlaybackSource
      );

    const hasDirectSource =
      sources.some(
        source =>
          source.type === "direct_mp4" ||
          source.type === "hls" ||
          source.type === "direct"
      );

    return {
      watch_id:
        watchId,

      quality,

      page_url:
        option?.page_url ??
        info?.source_url ??
        null,

      play_url:
        hasDirectSource
          ? buildPlayUrl(
              providerName,
              watchId,
              episodeId,
              quality
            )
          : null,

      playback_types:
        unique(
          sources.map(
            source => source.type
          )
        ),

      player:
        info?.player ??
        null,

      available_qualities:
        info?.available_qualities ??
        [],

      media_types:
        info?.media_types ??
        [],

      sources
    };
  } catch (error) {
    return {
      watch_id:
        watchId,

      quality,

      page_url:
        option?.page_url ??
        null,

      play_url:
        null,

      sources: [],

      error:
        error.message
    };
  }
}

async function resolveSource(
  source
) {
  const providerName =
    clean(
      source.provider
    ).toLowerCase();

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
    source.source_url ||
    source.provider_episode_id;

  try {
    const started =
      Date.now();

    const episodeResult =
      await provider.getEpisode(
        input
      );

    const episode =
      episodeResult?.episode ??
      {};

    const episodeId =
      episode.id ??
      source.provider_episode_id ??
      input;

    const watchOptions =
      Array.isArray(
        episodeResult?.watch_options
      )
        ? episodeResult.watch_options
        : [];

    const resolvedWatchOptions =
      await Promise.all(
        watchOptions.map(
          option =>
            inspectWatchOption({
              providerName,
              provider,
              episodeId,
              option
            })
        )
      );

    const directSources =
      resolvedWatchOptions
        .flatMap(
          option =>
            option.sources || []
        );

    const qualities =
      unique([
        ...(Array.isArray(
          episodeResult?.qualities
        )
          ? episodeResult.qualities
          : []),

        ...watchOptions.map(
          option =>
            option?.quality
        ),

        ...resolvedWatchOptions.flatMap(
          option =>
            option.available_qualities ||
            []
        ),

        ...directSources.map(
          item =>
            item?.quality
        )
      ]);

    const playableOptions =
      resolvedWatchOptions.filter(
        option =>
          option.play_url ||
          (
            Array.isArray(
              option.sources
            ) &&
            option.sources.length > 0
          )
      );

    return {
      provider:
        providerName,

      ok:
        true,

      status:
        playableOptions.length > 0
          ? "playable"
          : "metadata_only",

      duration_ms:
        Date.now() - started,

      episode: {
        id:
          episodeId,

        title:
          episode.title ??
          source.title ??
          null,

        image:
          episode.image ??
          null,

        source_url:
          episodeResult?.source_url ??
          source.source_url ??
          null
      },

      qualities,

      watch_option_count:
        watchOptions.length,

      playable_option_count:
        playableOptions.length,

      watch_options:
        resolvedWatchOptions
    };
  } catch (error) {
    return {
      provider:
        providerName,

      ok:
        false,

      status:
        "failed",

      error:
        error.message
    };
  }
}

async function resolveEpisode({
  query,
  groupKey,
  season = 1,
  episode
}) {
  const seasonNumber =
    Number(season);

  const episodeNumber =
    Number(episode);

  if (
    !Number.isInteger(
      seasonNumber
    ) ||
    seasonNumber <= 0
  ) {
    throw new Error(
      "INVALID_SEASON_NUMBER"
    );
  }

  if (
    !Number.isInteger(
      episodeNumber
    ) ||
    episodeNumber <= 0
  ) {
    throw new Error(
      "INVALID_EPISODE_NUMBER"
    );
  }

  const series =
    await resolveSeries({
      query,
      groupKey
    });

  const target =
    series.episodes.find(
      item =>
        item.season ===
          seasonNumber &&
        item.number ===
          episodeNumber
    );

  if (!target) {
    const error =
      new Error(
        "EPISODE_NOT_FOUND"
      );

    error.code =
      "EPISODE_NOT_FOUND";

    throw error;
  }

  const resolvedSources =
    await Promise.all(
      target.sources.map(
        resolveSource
      )
    );

  const playbackPlan =
    buildPlaybackPlan(
      resolvedSources.filter(
        item =>
          item.status === "playable"
      )
    );

  return {
    query:
      series.query,

    group_key:
      series.group_key,

    title:
      series.title,

    season:
      seasonNumber,

    episode:
      episodeNumber,

    matched_sources:
      target.sources.length,

    resolved_sources:
      resolvedSources.filter(
        item => item.ok
      ).length,

    playable_sources:
      resolvedSources.filter(
        item =>
          item.status ===
          "playable"
      ).length,

    failed_sources:
      resolvedSources.filter(
        item => !item.ok
      ).length,

    playback_option_count:
      playbackPlan.length,

    playback_plan:
      playbackPlan,

    sources:
      resolvedSources
  };
}

module.exports = {
  resolveEpisode,
  normalizePlaybackSource,
  buildPlaybackPlan
};
