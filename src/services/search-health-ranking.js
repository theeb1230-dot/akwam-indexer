'use strict';

const { rankSearchResults } = require('./provider-health-confidence');

/**
 * Rank already matched search results using measured provider health as a
 * deterministic tie-breaker. Semantic match_score remains authoritative.
 *
 * Health is advisory: an unavailable observability store must not make search
 * unavailable. In that case every provider receives neutral/unknown health.
 */
async function rankWithProviderHealth(items, observabilityRepository) {
  const input = Array.isArray(items) ? items : [];

  if (!observabilityRepository || typeof observabilityRepository.providerHealth !== 'function') {
    return rankSearchResults(input, []);
  }

  try {
    const rows = await observabilityRepository.providerHealth();
    return rankSearchResults(input, Array.isArray(rows) ? rows : []);
  } catch (_) {
    return rankSearchResults(input, []);
  }
}

module.exports = { rankWithProviderHealth };
