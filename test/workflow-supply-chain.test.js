const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflowDir = path.join(process.cwd(), ".github", "workflows");

test("all external GitHub Actions are pinned to immutable commit SHAs", () => {
  const files = fs.readdirSync(workflowDir)
    .filter(name => /\.ya?ml$/.test(name));

  const violations = [];
  const pinned = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(workflowDir, file), "utf8");
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const match = /^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/.exec(lines[index]);
      if (!match) continue;

      const reference = match[1];
      if (reference.startsWith("./") || reference.startsWith("docker://")) continue;

      const at = reference.lastIndexOf("@");
      const ref = at >= 0 ? reference.slice(at + 1) : "";
      if (!/^[0-9a-f]{40}$/i.test(ref)) {
        violations.push(`${file}:${index + 1} -> ${reference}`);
      } else {
        pinned.push(reference);
      }
    }
  }

  assert.ok(pinned.length > 0, "expected at least one pinned external action");
  assert.deepEqual(violations, []);
});
