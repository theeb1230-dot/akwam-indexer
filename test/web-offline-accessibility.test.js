const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Theeb Arab PWA provides offline navigation fallback and accessible landmarks", () => {
  const root = path.join(process.cwd(), "web");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "assets/app.css"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  const offline = fs.readFileSync(path.join(root, "offline.html"), "utf8");

  assert.match(html, /class="skip-link"/);
  assert.match(html, /id="mainContent"/);
  assert.match(html, /role="status"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);

  assert.match(worker, /theeb-arab-shell-v6/);
  assert.match(worker, /"\/offline\.html"/);
  assert.match(worker, /event\.request\.mode === "navigate"/);
  assert.match(worker, /caches\.match\("\/offline\.html"\)/);

  assert.match(offline, /أنت غير متصل بالإنترنت/);
  assert.match(offline, /إعادة المحاولة/);
});
