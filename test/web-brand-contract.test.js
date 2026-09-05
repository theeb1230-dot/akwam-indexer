const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Theeb Arab brand contract stays aligned with PWA metadata and theme", () => {
  const root = path.join(process.cwd(), "web");
  const brand = JSON.parse(fs.readFileSync(path.join(root, "brand.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "app.webmanifest"), "utf8"));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "assets/app.css"), "utf8");
  const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

  assert.equal(brand.product_name_ar, "ذيب العرب");
  assert.equal(brand.product_name_en, "Theeb Arab");
  assert.equal(manifest.name, brand.product_name_ar);
  assert.equal(manifest.short_name, brand.short_name);
  assert.equal(manifest.theme_color, "#111111");
  assert.equal(manifest.background_color, brand.theme.background);
  assert.match(html, /href="\/brand\.json"/);
  assert.match(css, /--accent:#d8c39a/);
  assert.match(css, /--bg:#0b0b0b/);
  assert.match(sw, /theeb-arab-shell-v7/);
  assert.match(sw, /"\/brand\.json"/);
});
