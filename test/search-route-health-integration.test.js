'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('public search route applies provider health ranking after semantic search', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'search.js'),
    'utf8'
  );

  assert.match(source, /rankWithProviderHealth/);
  assert.match(source, /createObservabilityRepository/);
  assert.match(source, /groupResults\(\s*rankedResults/);
  assert.match(source, /rankWithProviderHealth\(\s*result\.results/);
});

test('public search route keeps observability fail-safe and does not replace semantic search', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'search.js'),
    'utf8'
  );

  assert.match(source, /return null/);
  assert.match(source, /await searchAll\(/);
  assert.doesNotMatch(source, /provider_health[^\n]*match_score\s*[+*]/);
});
