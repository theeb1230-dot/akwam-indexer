'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const providers = require('../src/providers');
const { CAPABILITIES, describeProvider } = require('../src/providers/contract');

function source(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('universal provider contract exposes the required independent capabilities', () => {
  assert.deepEqual(CAPABILITIES, ['search', 'movies', 'series', 'episodes', 'watch', 'download']);
  for (const { name, provider } of providers.entries()) {
    const descriptor = describeProvider(provider);
    assert.equal(descriptor.id.length > 0, true, name);
    for (const capability of CAPABILITIES) assert.equal(typeof descriptor.capabilities[capability], 'boolean', `${name}.${capability}`);
  }
});

test('registry capability lookup fails closed instead of silently falling back', () => {
  const fixture = { id: 'fixture', search: async () => [] };
  const registry = new providers.ProviderRegistry({ fixture });
  assert.equal(registry.getCapable('fixture', 'search'), fixture);
  assert.throws(() => registry.getCapable('fixture', 'download'), error => error.code === 'PROVIDER_CAPABILITY_MISSING');
});

test('public playback boundary explicitly enforces watch capability', () => {
  const play = source('src/routes/play.js');
  assert.match(play, /getCapable\(providerName, "watch"\)/);
  assert.match(play, /WATCH_NOT_SUPPORTED/);
  assert.doesNotMatch(play, /getDownloadOptions/);
});

test('download resolution remains explicit user selection and never becomes watch fallback', () => {
  const download = source('src/services/download-resolver.js');
  assert.match(download, /automatic_download:\s*false/);
  assert.match(download, /action_required:\s*"user_selection"/);
  assert.doesNotMatch(download, /getWatchInfo|getWatch\(/);
});

test('search keeps semantic relevance authoritative while health is tie-break only', () => {
  const ranking = source('src/services/provider-health-confidence.js');
  assert.match(ranking, /const matchDelta/);
  assert.match(ranking, /if \(matchDelta !== 0\) return matchDelta/);
  assert.match(ranking, /healthDelta/);
});
