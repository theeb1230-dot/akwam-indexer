const test = require('node:test');
const assert = require('node:assert/strict');

const { rankResources } = require('../src/services/resource-quality');
const {
  executePlayback,
  playbackIntent,
} = require('../src/services/playback-executor');

test('unsupported intent is excluded instead of merely penalized', () => {
  const ranked = rankResources([
    {
      provider: 'watch-only-4k',
      quality: '2160p REMUX',
      capabilities: { watch: true, download: false },
      health: { successRate: 1, latencyMs: 20, verified: true },
    },
    {
      provider: 'download-1080p',
      quality: '1080p',
      capabilities: { watch: true, download: true },
      health: { successRate: 0.8, latencyMs: 300, verified: true },
    },
  ], { intent: 'download' });

  assert.deepEqual(ranked.map(item => item.provider), ['download-1080p']);
});

test('playback intent defaults to watch and preserves explicit download', () => {
  assert.equal(playbackIntent({}), 'watch');
  assert.equal(playbackIntent({ intent: 'watch' }), 'watch');
  assert.equal(playbackIntent({ intent: 'download' }), 'download');
});

test('executor never validates a candidate that explicitly lacks requested capability', async () => {
  const validated = [];
  const health = {
    ranked: async candidates => candidates,
    circuitOpen: async () => false,
    recordResult: async () => ({
      success_count: 1,
      failure_count: 0,
      consecutive_failures: 0,
      avg_latency_ms: 10,
      circuit_open_until: null,
    }),
  };
  const resolve = async () => ({
    canonical_key: 'series|s1|e1',
    group_key: 'series',
    title: 'Series',
    season: 1,
    episode: 1,
    matched_sources: 2,
    resolved_sources: 2,
    playable_sources: 2,
    failed_sources: 0,
    playback_option_count: 2,
    sources: [],
    playback_plan: [
      {
        provider: 'watch-only',
        server: 'a',
        quality: '2160p',
        capabilities: { watch: true, download: false },
      },
      {
        provider: 'download-capable',
        server: 'b',
        quality: '1080p',
        capabilities: { watch: true, download: true },
      },
    ],
  });
  const validate = async candidate => {
    validated.push(candidate.provider);
    return { status: 'healthy', latency_ms: 10 };
  };

  const result = await executePlayback(
    { intent: 'download' },
    { resolve, validate, health }
  );

  assert.equal(result.status, 'ready');
  assert.equal(result.intent, 'download');
  assert.deepEqual(validated, ['download-capable']);
  assert.equal(result.selected_source.provider, 'download-capable');
});
