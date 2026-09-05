#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const forbiddenNames = new Set([
  "localhost", "0.0.0.0", "127.0.0.1", "::1",
  "example.com", "example.org", "example.net", "example.invalid"
]);
const forbiddenSuffixes = [".invalid", ".example", ".test", ".localhost"];
const forbiddenLabels = new Set(["dev", "development", "test", "testing", "stage", "staging", "example"]);

function fail(code, details) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  throw error;
}

function forbiddenHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (forbiddenNames.has(host)) return true;
  if (forbiddenSuffixes.some(suffix => host.endsWith(suffix))) return true;
  if (host.split(".").some(label => forbiddenLabels.has(label))) return true;
  if (/^(10\.|127\.|0\.|192\.168\.|169\.254\.)/.test(host)) return true;
  const match172 = /^172\.(\d+)\./.exec(host);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return true;
  if (/^(::|::1|fc|fd|fe[89ab]|2001:db8:)/i.test(host)) return true;
  return false;
}

function filesUnder(root) {
  const output = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current)) stack.push(path.join(current, name));
    } else if (stat.isFile()) output.push(current);
  }
  return output;
}

function validateArtifact(root, expectedBase) {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    fail("ARTIFACT_DIRECTORY_REQUIRED");
  }
  let expected;
  try { expected = new URL(String(expectedBase || "").trim()); }
  catch { fail("EXPECTED_API_BASE_URL_INVALID"); }
  if (expected.protocol !== "https:" || forbiddenHost(expected.hostname)) {
    fail("EXPECTED_API_BASE_URL_NOT_INSTALLABLE");
  }

  const expectedBytes = Buffer.from(String(expectedBase));
  let expectedFound = false;
  const rejected = [];

  for (const file of filesUnder(root)) {
    const buffer = fs.readFileSync(file);
    if (!expectedFound && buffer.includes(expectedBytes)) expectedFound = true;
    const text = buffer.toString("latin1");
    for (const raw of text.match(/https?:\/\/[^\s"'<>\x00-\x1f]{1,2048}/gi) || []) {
      let parsed;
      try { parsed = new URL(raw.replace(/[),.;}\]]+$/g, "")); }
      catch { continue; }
      if (forbiddenHost(parsed.hostname)) {
        rejected.push({ file: path.relative(root, file), host: parsed.hostname });
      }
    }
  }

  if (rejected.length) fail("PLACEHOLDER_OR_PRIVATE_ENDPOINT_FOUND", rejected.slice(0, 20));
  if (!expectedFound) fail("CONFIGURED_API_NOT_FOUND_IN_ARTIFACT");
  return { status: "passed", expected_origin: expected.origin };
}

if (require.main === module) {
  try { process.stdout.write(JSON.stringify(validateArtifact(process.argv[2], process.argv[3])) + "\n"); }
  catch (error) {
    console.error(error.code || error.message);
    if (error.details) console.error(JSON.stringify(error.details));
    process.exit(1);
  }
}

module.exports = { forbiddenHost, validateArtifact };
