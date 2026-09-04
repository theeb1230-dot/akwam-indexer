const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Android Flutter build pipeline remains wired to a real APK artifact", () => {
  const root = process.cwd();
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const pubspec = fs.readFileSync(path.join(root, "clients/flutter/pubspec.yaml"), "utf8");
  const main = fs.readFileSync(path.join(root, "clients/flutter/lib/main.dart"), "utf8");

  assert.match(workflow, /flutter-android:/);
  assert.match(workflow, /flutter build apk --debug/);
  assert.match(workflow, /theeb-arab-android-debug/);
  assert.match(workflow, /app-debug\.apk/);
  assert.match(pubspec, /name: theeb_arab/);
  assert.match(pubspec, /path: \.\.\/dart/);
  assert.match(main, /ذيب العرب/);
  assert.match(main, /TheebApiClient/);
});
