'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreResource, rankResources } = require('../src/services/resource-quality');
const { describeProvider, assertProviderContract } = require('../src/providers/contract');

test('healthy 4K resource outranks unhealthy 4K and healthy 1080p', () => {
  const ranked = rankResources([
    { id: '1080-fast', quality: '1080p WEB-DL H265', health: { successRate: 1, latencyMs: 100, verified: true }, capabilities: { watch: true } },
    { id: '4k-dead', quality: '2160p REMUX DV', health: { successRate: 0.05, latencyMs: 9000 }, capabilities: { watch: true } },
    { id: '4k-good', quality: '2160p REMUX DV TrueHD HEVC', health: { successRate: 0.99, latencyMs: 250, verified: true }, capabilities: { watch: true } },
  ]);
  assert.equal(ranked[0].id, '4k-good');
  assert.ok(ranked[0].resourceScore.total > ranked[1].resourceScore.total);
});

test('intent penalizes unsupported watch/download capability', () => {
  const watchOnly = { quality: '1080p', health: { successRate: 1, latencyMs: 100 }, capabilities: { watch: true, download: false } };
  assert.ok(scoreResource(watchOnly, { intent: 'watch' }).total > scoreResource(watchOnly, { intent: 'download' }).total);
});

test('provider descriptor infers capabilities without coupling core to provider name', () => {
  const provider = { id: 'fixture', search() {}, getSeries() {}, resolveWatch() {}, capabilities: { movies: true } };
  const descriptor = describeProvider(provider);
  assert.equal(descriptor.id, 'fixture');
  assert.equal(descriptor.capabilities.search, true);
  assert.equal(descriptor.capabilities.series, true);
  assert.equal(descriptor.capabilities.watch, true);
  assert.equal(descriptor.capabilities.movies, true);
  assert.equal(descriptor.capabilities.download, false);
  assert.deepEqual(assertProviderContract(provider, ['search', 'watch']), descriptor);
});

test('provider descriptor preserves legacy watch/download method compatibility', () => {
  const provider = {
    id: 'legacy-fixture',
    getSeries() {},
    getEpisode() {},
    getWatchInfo() {},
    getDownloadOptions() {},
  };
  const descriptor = describeProvider(provider);
  assert.equal(descriptor.capabilities.watch, true);
  assert.equal(descriptor.capabilities.download, true);
  assert.deepEqual(assertProviderContract(provider, ['watch', 'download']), descriptor);
});

test('provider contract fails closed when a required capability is absent', () => {
  assert.throws(() => assertProviderContract({ id: 'fixture', search() {} }, ['download']), (error) => {
    assert.equal(error.code, 'PROVIDER_CAPABILITY_MISSING');
    assert.deepEqual(error.missing, ['download']);
    return true;
  });
});
