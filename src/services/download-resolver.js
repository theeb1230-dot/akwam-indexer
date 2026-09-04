const crypto = require("node:crypto");

const URL_FIELDS = new Set([
  "url",
  "direct_url",
  "download_url",
  "page_url",
  "resolved_url"
]);

const DOWNLOAD_TYPES = new Set([
  "download_file",
  "external_download_page"
]);

function clean(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function normalizeQuality(value) {
  const quality = clean(value);
  if (!quality) return null;

  const match = quality.match(/(2160|1440|1080|720|480|360)p?/i);
  return match ? `${match[1]}p` : quality;
}

function safeHttpsUrl(value) {
  const input = clean(value);
  if (!input) return null;

  try {
    const url = new URL(input);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function stableLocator(option, context) {
  const declaredType = clean(option.type);
  const type = DOWNLOAD_TYPES.has(declaredType)
    ? declaredType
    : (option.direct_url || option.download_url || option.resolved_url
      ? "download_file"
      : "external_download_page");

  return {
    provider: context.provider,
    provider_episode_id:
      String(context.providerEpisodeId),
    download_id:
      clean(option.download_id || option.id),
    quality: normalizeQuality(option.quality),
    format: clean(option.format || option.extension),
    type
  };
}

function candidateKey(locator) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(locator))
    .digest("hex");
}

function normalizeDownloadOption(option = {}, context = {}) {
  const locator = stableLocator(option, context);
  const liveUrl = safeHttpsUrl(
    option.resolved_url ||
    option.download_url ||
    option.direct_url ||
    option.page_url ||
    option.url
  );

  return {
    candidate_id: candidateKey(locator),
    provider: locator.provider,
    provider_episode_id: locator.provider_episode_id,
    download_id: locator.download_id,
    type: locator.type,
    quality: locator.quality,
    format: locator.format,
    size_bytes:
      Number.isSafeInteger(Number(option.size_bytes)) &&
      Number(option.size_bytes) >= 0
        ? Number(option.size_bytes)
        : null,
    filename: clean(option.filename),
    availability: clean(option.availability) || "unknown",
    live_url: liveUrl,
    is_direct_file: locator.type === "download_file",
    requires_external_navigation:
      locator.type === "external_download_page",
    requires_user_selection: true,
    locator
  };
}

function providerErrorCode(error) {
  const code = clean(error?.code || error?.message);
  return code && /^[A-Z][A-Z0-9_]{2,63}$/.test(code)
    ? code
    : "PROVIDER_DOWNLOAD_ERROR";
}

function metadataWithoutUrls(option) {
  if (Array.isArray(option)) {
    return option.map(metadataWithoutUrls);
  }

  if (!option || typeof option !== "object") {
    return option;
  }

  return Object.fromEntries(
    Object.entries(option)
      .filter(([key]) => {
        const normalized = key.toLowerCase();
        return !URL_FIELDS.has(normalized) &&
          !normalized.endsWith("_url") &&
          !normalized.endsWith("url");
      })
      .map(([key, value]) => [key, metadataWithoutUrls(value)])
  );
}

function createDownloadResolver(dependencies = {}) {
  const repository =
    dependencies.repository ||
    require("../repositories/download-repository")
      .createDownloadRepository(dependencies.env || process.env);
  const providers = dependencies.providers || require("../providers");

  async function optionsForSource(source) {
    if (!providers.has(source.provider)) {
      return { options: [], error: "UNKNOWN_PROVIDER" };
    }

    const provider = providers.get(source.provider);
    if (typeof provider.getDownloadOptions !== "function") {
      return { options: [], error: "DOWNLOAD_NOT_SUPPORTED" };
    }

    let rawOptions = [];
    try {
      rawOptions = await provider.getDownloadOptions(source.provider_episode_id);
    } catch (error) {
      return { options: [], error: providerErrorCode(error) };
    }

    if (!Array.isArray(rawOptions)) {
      return { options: [], error: "PROVIDER_SCHEMA_ERROR" };
    }

    const options = rawOptions.map(option =>
      normalizeDownloadOption(option, {
        provider: source.provider,
        providerEpisodeId: source.provider_episode_id
      })
    );

    await repository.replaceCandidates(
      source,
      options.map((option, index) => ({
        ...option,
        metadata: metadataWithoutUrls(rawOptions[index])
      }))
    );

    return { options, error: null };
  }

  async function resolveDownloadOptions(canonicalEpisodeId) {
    const id = Number(canonicalEpisodeId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      const error = new Error("INVALID_CANONICAL_EPISODE_ID");
      error.code = "INVALID_CANONICAL_EPISODE_ID";
      throw error;
    }

    const episode = await repository.getEpisode(id);
    if (!episode) {
      const error = new Error("CANONICAL_EPISODE_NOT_FOUND");
      error.code = "CANONICAL_EPISODE_NOT_FOUND";
      throw error;
    }

    const sources = await repository.listSources(id);
    const resolved = await Promise.all(sources.map(optionsForSource));
    const options = resolved.flatMap(item => item.options);

    return {
      episode: {
        id: episode.id,
        series_title: episode.series_title,
        season: episode.season_number,
        number: episode.episode_number,
        title: episode.title
      },
      download_option_count: options.length,
      download_options: options,
      source_errors: resolved
        .map((item, index) => item.error ? ({
          provider: sources[index].provider,
          error: item.error
        }) : null)
        .filter(Boolean),
      automatic_download: false,
      action_required: "user_selection"
    };
  }

  return { resolveDownloadOptions };
}

module.exports = {
  createDownloadResolver,
  normalizeDownloadOption,
  metadataWithoutUrls,
  providerErrorCode
};
