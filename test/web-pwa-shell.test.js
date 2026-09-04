const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Theeb Arab PWA shell has required installable assets", () => {
  const root = path.join(process.cwd(), "web");
  for (const file of [
    "index.html",
    "app.webmanifest",
    "service-worker.js",
    "assets/app.css",
    "assets/app.js",
    "assets/icon.svg"
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }

  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /ذيب العرب/);
  assert.match(html, /app\.webmanifest/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /id="installHint"/);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "app.webmanifest"), "utf8")
  );
  assert.equal(manifest.name, "ذيب العرب");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.icons.some(icon => icon.purpose === "maskable"), true);

  const app = fs.readFileSync(path.join(root, "assets/app.js"), "utf8");
  assert.match(app, /\/v1\/search\?q=/);
  assert.match(app, /serviceWorker\.register/);

  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  assert.match(worker, /theeb-arab-shell-v5/);
  assert.match(worker, /url\.pathname\.startsWith\("\/v1\/"\)/);
});

test("server serves web shell and keeps API metadata off root", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/server.js"),
    "utf8"
  );

  assert.match(source, /express\.static\(path\.join\(process\.cwd\(\), "web"\)/);
  assert.match(source, /app\.get\(\s*"\/api"/);
  assert.doesNotMatch(source, /app\.get\(\s*"\/"\s*,\s*\(req, res\) => \{\s*res\.json/);
});
