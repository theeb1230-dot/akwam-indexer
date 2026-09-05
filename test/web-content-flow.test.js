const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Theeb Arab web flow exposes series episode watch and download choices", () => {
  const root = path.join(process.cwd(), "web");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "assets/app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "assets/app.css"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

  assert.match(html, /id="detailView"/);
  assert.match(html, /id="seriesDetail"/);
  assert.match(html, /id="episodeDetail"/);
  assert.match(html, /id="episodeTemplate"/);

  assert.match(app, /\/v1\/series\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(app, /\/v1\/series\/\$\{encodeURIComponent\(id\)\}\/episodes/);
  assert.match(app, /\/v1\/episodes\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(app, /\/v1\/playback\/sessions/);
  assert.match(app, /\/v1\/episodes\/\$\{encodeURIComponent\(episodeId\)\}\/download-options/);

  assert.match(app, /watch\.addEventListener\("click"/);
  assert.match(app, /download\.addEventListener\("click"/);
  const openEpisodeBlock = app.match(/async function openEpisode\(id\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.doesNotMatch(openEpisodeBlock, /loadWatchOptions\(/);
  assert.doesNotMatch(openEpisodeBlock, /loadDownloadOptions\(/);

  assert.match(app, /لا يتم تشغيل الفيديو أو بدء التحميل تلقائيًا/);
  assert.match(css, /\.choice-action\.watch/);
  assert.match(css, /\.choice-action\.download/);
  assert.match(worker, /theeb-arab-shell-v7/);
});
