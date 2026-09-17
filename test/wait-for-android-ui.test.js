const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const probe = path.resolve(__dirname, '../scripts/wait-for-android-ui.sh');

function runProbe({ readyOn = Infinity, maxAttempts = 3 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theeb-ui-probe-'));
  const adb = path.join(dir, 'adb');
  const count = path.join(dir, 'count');
  fs.writeFileSync(adb, `#!/usr/bin/env bash\nset -e\nCOUNT_FILE=${JSON.stringify(count)}\nif [ "$1" = shell ] && [ "$2" = rm ]; then exit 0; fi\nif [ "$1" = shell ] && [ "$2" = uiautomator ]; then n=0; [ -f "$COUNT_FILE" ] && n=$(cat "$COUNT_FILE"); n=$((n+1)); echo "$n" > "$COUNT_FILE"; exit 0; fi\nif [ "$1" = pull ]; then n=$(cat "$COUNT_FILE"); if [ "$n" -ge ${readyOn} ]; then echo '<hierarchy><node class="android.widget.EditText" bounds="[0,0][10,10]"/></hierarchy>' > "$3"; else echo '<hierarchy/>' > "$3"; fi; exit 0; fi\nexit 0\n`);
  fs.chmodSync(adb, 0o755);
  const result = spawnSync('bash', [probe, path.join(dir, 'ui.xml')], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, THEEB_UI_MAX_ATTEMPTS: String(maxAttempts), THEEB_UI_SLEEP_SECONDS: '0' },
    encoding: 'utf8',
  });
  const attempts = fs.existsSync(count) ? Number(fs.readFileSync(count, 'utf8')) : 0;
  return { ...result, attempts };
}

test('waits until the expected editable control exists', () => {
  const result = runProbe({ readyOn: 2, maxAttempts: 4 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.attempts, 2);
  assert.match(result.stdout, /ANDROID_UI_READY attempt=2/);
});

test('fails closed after the bounded attempt budget', () => {
  const result = runProbe({ readyOn: 99, maxAttempts: 3 });
  assert.equal(result.status, 1);
  assert.equal(result.attempts, 3);
  assert.match(result.stderr, /ANDROID_UI_READINESS_TIMEOUT/);
});

test('rejects an unbounded attempt budget before invoking adb', () => {
  const result = runProbe({ readyOn: 1, maxAttempts: 31 });
  assert.equal(result.status, 2);
  assert.equal(result.attempts, 0);
  assert.match(result.stderr, /UI_MAX_ATTEMPTS_OUT_OF_RANGE/);
});
