const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicResponseFiles = [
  "src/server.js",
  "src/routes/library.js",
  "src/routes/canonical.js",
  "src/routes/refresh.js",
  "src/routes/refresh-all.js",
  "src/routes/play.js",
  "src/routes/search.js",
  "src/routes/resolve.js",
  "src/routes/episode-resolve.js",
  "src/routes/playback.js"
];

test("public API responses do not expose raw exception messages", () => {
  for (const file of publicResponseFiles) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(
      source,
      /message\s*:\s*error\.message/,
      file + " must not return raw error.message to clients"
    );
  }
});

test("public failure responses keep user-facing Arabic guidance", () => {
  for (const file of publicResponseFiles) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    if (/status\((?:500|502)\)/.test(source)) {
      assert.match(source, /[\u0600-\u06FF]/, file + " should contain Arabic failure guidance");
    }
  }
});


test("PWA never renders raw exception messages", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "web/assets/app.js"), "utf8");
  assert.doesNotMatch(
    source,
    /error\.message/,
    "web/assets/app.js must not render raw exception messages"
  );
});
