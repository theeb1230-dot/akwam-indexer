'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  providerHealthConfidence,
  rankSearchResults
} = require('../src/services/provider-health-confidence');

test('provider health confidence is neutral and explicitly unknown without evidence', () => {
  assert.deepEqual(providerHealthConfidence(null), {
    known: false,
    score: 50,
    success_rate: null,
    avg_latency_ms: null,
    samples: 0
  });
});

test('provider health confidence rewards measured reliability and latency', () => {
  const healthy = providerHealthConfidence({ successes: 19, failures: 1, avg_latency_ms: 300 });
  const unhealthy = providerHealthConfidence({ successes: 2, failures: 8, avg_latency_ms: 2400 });
  assert.equal(healthy.known, true);
  assert.equal(healthy.samples, 20);
  assert.ok(healthy.score > unhealthy.score);
});

test('search semantic match always outranks provider health', () => {
  const ranked = rankSearchResults([
    { title: 'exact', search_provider: 'slow', match_score: 100 },
    { title: 'weaker', search_provider: 'fast', match_score: 98 }
  ], [
    { provider: 'slow', successes: 1, failures: 9, avg_latency_ms: 5000 },
    { provider: 'fast', successes: 100, failures: 0, avg_latency_ms: 100 }
  ]);
  assert.equal(ranked[0].title, 'exact');
});

test('provider health breaks ties without deleting unknown providers', () => {
  const ranked = rankSearchResults([
    { title: 'unknown', search_provider: 'unknown', match_score: 98 },
    { title: 'unhealthy', search_provider: 'bad', match_score: 98 },
    { title: 'healthy', search_provider: 'good', match_score: 98 }
  ], [
    { provider: 'bad', successes: 1, failures: 9, avg_latency_ms: 4000 },
    { provider: 'good', successes: 20, failures: 0, avg_latency_ms: 200 }
  ]);
  assert.deepEqual(ranked.map(item => item.title), ['healthy', 'unknown', 'unhealthy']);
  assert.equal(ranked[1].provider_health.known, false);
});
