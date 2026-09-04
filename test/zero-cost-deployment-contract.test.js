const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("zero-cost deployment evidence contract stays explicit and non-claiming", () => {
  const root = process.cwd();
  const doc = fs.readFileSync(path.join(root, "docs/ZERO_COST_DEPLOYMENT.md"), "utf8");
  const smoke = fs.readFileSync(path.join(root, "scripts/deployment-smoke-test.js"), "utf8");

  assert.match(doc, /no external deployment is claimed/i);
  assert.match(doc, /THEEB_ZERO_COST_ONLY=true/);
  assert.match(doc, /No autoscaling that can create billable instances/);
  assert.match(doc, /No paid custom domain purchase/);
  assert.match(doc, /npm run deploy:smoke/);
  assert.match(doc, /Current blocker/);

  assert.match(smoke, /readJson\(base, "\/api"/);
  assert.match(smoke, /readText\(base, "\/"/);
  assert.match(smoke, /WEB_ROOT_CONTRACT_FAILED/);
  assert.match(smoke, /theeb-arab-pwa/);
});
