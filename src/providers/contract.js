'use strict';

const CAPABILITIES = Object.freeze(['search', 'movies', 'series', 'episodes', 'watch', 'download']);

function normalizeCapabilities(input = {}) {
  return Object.fromEntries(CAPABILITIES.map((key) => [key, input[key] === true]));
}

function describeProvider(provider) {
  if (!provider || typeof provider !== 'object') throw new TypeError('provider must be an object');
  const id = String(provider.id || provider.name || '').trim();
  if (!id) throw new TypeError('provider id/name is required');
  const inferred = {
    search: typeof provider.search === 'function',
    movies: provider.capabilities?.movies,
    series: typeof provider.getSeries === 'function' || provider.capabilities?.series,
    episodes: typeof provider.getEpisode === 'function' || typeof provider.getEpisodes === 'function' || provider.capabilities?.episodes,
    watch:
      typeof provider.getWatch === 'function' ||
      typeof provider.resolveWatch === 'function' ||
      typeof provider.getWatchInfo === 'function' ||
      provider.capabilities?.watch,
    download:
      typeof provider.getDownload === 'function' ||
      typeof provider.resolveDownload === 'function' ||
      typeof provider.getDownloadOptions === 'function' ||
      provider.capabilities?.download,
  };
  return { id, capabilities: normalizeCapabilities(inferred) };
}

function assertProviderContract(provider, required = ['search']) {
  const descriptor = describeProvider(provider);
  const missing = required.filter((capability) => !descriptor.capabilities[capability]);
  if (missing.length) {
    const error = new TypeError(`Provider ${descriptor.id} missing capabilities: ${missing.join(', ')}`);
    error.code = 'PROVIDER_CAPABILITY_MISSING';
    error.provider = descriptor.id;
    error.missing = missing;
    throw error;
  }
  return descriptor;
}

module.exports = { CAPABILITIES, normalizeCapabilities, describeProvider, assertProviderContract };
