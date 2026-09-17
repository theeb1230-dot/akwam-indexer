const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const worker = fs.readFileSync('deploy/cloudflare/worker.js', 'utf8');

test('edge origin requests have a bounded timeout', () => {
  assert.match(worker, /AbortSignal\.timeout\(ORIGIN_TIMEOUT_MS\)/);
  assert.match(worker, /const ORIGIN_TIMEOUT_MS = 8000;/);
});

test('edge router preserves manual redirect handling and excludes play proxying', () => {
  assert.match(worker, /redirect: "manual"/);
  assert.match(worker, /url\.pathname\.startsWith\("\/play\/"\)/);
});
