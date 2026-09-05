#!/usr/bin/env node
const dns = require("node:dns").promises;
const net = require("node:net");

const raw = String(process.env.THEEB_INSTALLABLE_API_BASE_URL || "").trim();
const token = String(process.env.THEEB_INSTALLABLE_API_TOKEN || "").trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!raw) fail("THEEB_INSTALLABLE_API_BASE_URL_REQUIRED");

let base;
try {
  base = new URL(raw);
} catch {
  fail("THEEB_INSTALLABLE_API_BASE_URL_INVALID");
}

if (base.protocol !== "https:") fail("THEEB_INSTALLABLE_API_HTTPS_REQUIRED");
if (base.username || base.password) fail("THEEB_INSTALLABLE_API_CREDENTIALS_FORBIDDEN");
if (base.search || base.hash) fail("THEEB_INSTALLABLE_API_QUERY_FRAGMENT_FORBIDDEN");

const host = base.hostname.toLowerCase();
const bannedExact = new Set([
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "example.com",
  "example.org",
  "example.net",
  "example.invalid"
]);
const bannedSuffixes = [".invalid", ".example", ".test", ".localhost"];
const suspiciousLabels = new Set(["dev", "development", "test", "testing", "staging", "stage", "example"]);

if (
  bannedExact.has(host) ||
  bannedSuffixes.some(suffix => host.endsWith(suffix)) ||
  host.split(".").some(label => suspiciousLabels.has(label))
) {
  fail("THEEB_INSTALLABLE_API_PLACEHOLDER_FORBIDDEN");
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }
  return true;
}

async function fetchJson(url, { authorization = false } = {}) {
  const headers = { accept: "application/json" };
  if (authorization && token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }
  if (!String(response.headers.get("content-type") || "").includes("application/json")) {
    throw new Error("JSON_CONTENT_TYPE_REQUIRED");
  }
  JSON.parse(text || "{}");
}

(async () => {
  const records = await dns.lookup(host, { all: true });
  if (!records.length) fail("THEEB_INSTALLABLE_API_DNS_EMPTY");
  if (records.some(record => isPrivateAddress(record.address))) {
    fail("THEEB_INSTALLABLE_API_PUBLIC_DNS_REQUIRED");
  }

  const normalizedBase = new URL(base.toString());
  if (!normalizedBase.pathname.endsWith("/")) normalizedBase.pathname += "/";

  try {
    await fetchJson(new URL("readyz", normalizedBase));
  } catch (error) {
    fail(`THEEB_INSTALLABLE_API_READINESS_FAILED:${error.message}`);
  }

  try {
    const search = new URL("v1/search", normalizedBase);
    search.searchParams.set("q", "theeb-release-smoke");
    await fetchJson(search, { authorization: true });
  } catch (error) {
    fail(`THEEB_INSTALLABLE_API_SEARCH_SMOKE_FAILED:${error.message}`);
  }

  console.log("THEEB_INSTALLABLE_API_VALIDATED");
})().catch(error => fail(`THEEB_INSTALLABLE_API_VALIDATION_FAILED:${error.message}`));
