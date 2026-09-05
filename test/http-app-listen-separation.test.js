const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

test("HTTP app can be hosted by an external server without calling startServer", async t => {
  const { app, startServer } = require("../src/server");

  assert.equal(typeof app, "function");
  assert.equal(typeof startServer, "function");

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/livez`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "alive");
  assert.equal(typeof body.version, "string");
});

test("startServer remains the explicit process-owned listener boundary", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").join(process.cwd(), "src/server.js"),
    "utf8"
  );

  assert.match(source, /function startServer\(options = \{\}\)/);
  assert.match(source, /const server = app\.listen\(port, host/);
  assert.doesNotMatch(source, /if \(require\.main === module\)/);
});
