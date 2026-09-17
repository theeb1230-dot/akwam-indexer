'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../src/providers');
const { describeProvider } = require('../src/providers/contract');

test('searchable providers are selected through the shared capability contract', () => {
  const searchable = registry.searchable();
  assert.ok(searchable.length > 0);
  for (const { provider } of searchable) {
    assert.equal(describeProvider(provider).capabilities.search, true);
  }
});

test('registry descriptions use the canonical capability vocabulary', () => {
  for (const descriptor of registry.describeAll()) {
    assert.deepEqual(
      Object.keys(descriptor.capabilities),
      ['search', 'movies', 'series', 'episodes', 'watch', 'download']
    );
    assert.equal(typeof descriptor.capabilities.search, 'boolean');
    assert.equal(typeof descriptor.capabilities.watch, 'boolean');
    assert.equal(typeof descriptor.capabilities.download, 'boolean');
  }
});

test('capability filtering fails closed for unsupported capabilities', () => {
  for (const { provider } of registry.capable('download')) {
    assert.equal(describeProvider(provider).capabilities.download, true);
  }
});
