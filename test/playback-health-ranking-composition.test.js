const test = require('node:test');
const assert = require('node:assert/strict');

const { withRepository } = require('../src/services/playback-health');
const { rankResources } = require('../src/services/resource-quality');
const { resourceCandidate } = require('../src/services/playback-executor');

function key(candidate) {
  return [candidate.provider, candidate.episode_id, candidate.watch_id, candidate.server || '', candidate.type, candidate.quality || '']
    .map(value => String(value || '')).join('|');
}

test('ranked candidates preserve historical health for resource scoring', async () => {
  const unhealthy4k = {
    provider: 'unstable-4k', episode_id: 'e1', watch_id: 'w1', server: 'a', type: 'direct_mp4', quality: '2160p',
    capabilities: { watch: true }
  };
  const healthy1080 = {
    provider: 'healthy-1080', episode_id: 'e1', watch_id: 'w2', server: 'b', type: 'direct_mp4', quality: '1080p',
    capabilities: { watch: true }
  };
  const healthByKey = new Map([
    [key(unhealthy4k), { success_count: 0, failure_count: 20, consecutive_failures: 5, avg_latency_ms: 5000 }],
    [key(healthy1080), { success_count: 20, failure_count: 0, consecutive_failures: 0, avg_latency_ms: 50 }]
  ]);
  const store = {
    async getHealth(candidateKey) { return healthByKey.get(candidateKey) || null; },
    async getVerification() { return null; }
  };
  const health = withRepository(store);
  const healthRanked = await health.ranked([unhealthy4k, healthy1080]);

  assert.deepEqual(healthRanked[0].playback_health, healthByKey.get(key(healthy1080)));
  assert.ok(healthRanked.every(candidate => Object.hasOwn(candidate, 'playback_health')));

  const resourceRanked = rankResources(healthRanked.map(resourceCandidate), { intent: 'watch' });
  assert.equal(resourceRanked[0].provider, 'healthy-1080');
  assert.equal(resourceRanked[0].health.successRate, 1);
  assert.equal(resourceRanked[1].health.successRate, 0);
});
