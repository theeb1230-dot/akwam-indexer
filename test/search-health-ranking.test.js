'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rankWithProviderHealth } = require('../src/services/search-health-ranking');

function item(provider, matchScore, id) {
  return { search_provider: provider, match_score: matchScore, provider_series_id: id };
}

test('measured provider health breaks equal semantic-score ties', async () => {
  const results = await rankWithProviderHealth([
    item('slow', 90, 'a'),
    item('healthy', 90, 'b')
  ], {
    async providerHealth() {
      return [
        { provider: 'slow', successes: 1, failures: 9, avg_latency_ms: 4000 },
        { provider: 'healthy', successes: 10, failures: 0, avg_latency_ms: 50 }
      ];
    }
  });

  assert.equal(results[0].search_provider, 'healthy');
  assert.equal(results[1].search_provider, 'slow');
  assert.equal(results[0].provider_health.known, true);
});

test('semantic match score cannot be overridden by provider health', async () => {
  const results = await rankWithProviderHealth([
    item('unhealthy', 100, 'exact'),
    item('healthy', 99, 'near')
  ], {
    async providerHealth() {
      return [
        { provider: 'unhealthy', successes: 0, failures: 20, avg_latency_ms: 5000 },
        { provider: 'healthy', successes: 20, failures: 0, avg_latency_ms: 10 }
      ];
    }
  });

  assert.equal(results[0].provider_series_id, 'exact');
});

test('observability failure fails open to neutral health without dropping results', async () => {
  const input = [item('a', 80, 'first'), item('b', 80, 'second')];
  const results = await rankWithProviderHealth(input, {
    async providerHealth() { throw new Error('DB_UNAVAILABLE'); }
  });

  assert.deepEqual(results.map((entry) => entry.provider_series_id), ['first', 'second']);
  assert.equal(results[0].provider_health.known, false);
  assert.equal(results[0].provider_health.score, 50);
});

test('missing observability repository preserves backward-compatible ordering', async () => {
  const results = await rankWithProviderHealth([
    item('a', 70, 'a'),
    item('b', 95, 'b')
  ]);

  assert.deepEqual(results.map((entry) => entry.provider_series_id), ['b', 'a']);
});
