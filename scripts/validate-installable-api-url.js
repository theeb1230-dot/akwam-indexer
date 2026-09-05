#!/usr/bin/env node
const dns = require("node:dns").promises;
const net = require("node:net");

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

function configError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function parseInstallableBase(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) throw configError("THEEB_INSTALLABLE_API_BASE_URL_REQUIRED");

  let base;
  try {
    base = new URL(raw);
  } catch {
    throw configError("THEEB_INSTALLABLE_API_BASE_URL_INVALID");
  }

  if (base.protocol !== "https:") throw configError("THEEB_INSTALLABLE_API_HTTPS_REQUIRED");
  if (base.username || base.password) {
    throw configError("THEEB_INSTALLABLE_API_CREDENTIALS_FORBIDDEN");
  }
  if (base.search || base.hash) {
    throw configError("THEEB_INSTALLABLE_API_QUERY_FRAGMENT_FORBIDDEN");
  }

  const host = base.hostname.toLowerCase();
  if (
    bannedExact.has(host) ||
    bannedSuffixes.some(suffix => host.endsWith(suffix)) ||
    host.split(".").some(label => suspiciousLabels.has(label))
  ) {
    throw configError("THEEB_INSTALLABLE_API_PLACEHOLDER_FORBIDDEN");
  }

  if (!base.pathname.endsWith("/")) base.pathname += "/";
  return base;
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

async function fetchJson(url, token) {
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  if (!String(response.headers.get("content-type") || "").includes("application/json")) {
    throw new Error("JSON_CONTENT_TYPE_REQUIRED");
  }
  JSON.parse(text || "{}");
}

async function validateReachability(base, token = "") {
  const records = await dns.lookup(base.hostname, { all: true });
  if (!records.length) throw configError("THEEB_INSTALLABLE_API_DNS_EMPTY");
  if (records.some(record => isPrivateAddress(record.address))) {
    throw configError("THEEB_INSTALLABLE_API_PUBLIC_DNS_REQUIRED");
  }

  try {
    await fetchJson(new URL("readyz", base), "");
  } catch (error) {
    throw configError(`THEEB_INSTALLABLE_API_READINESS_FAILED:${error.message}`);
  }

  try {
    const search = new URL("v1/search", base);
    search.searchParams.set("q", "theeb-release-smoke");
    await fetchJson(search, token);
  } catch (error) {
    throw configError(`THEEB_INSTALLABLE_API_SEARCH_SMOKE_FAILED:${error.message}`);
  }
}

async function main(env = process.env) {
  const base = parseInstallableBase(env.THEEB_INSTALLABLE_API_BASE_URL);
  await validateReachability(base, String(env.THEEB_INSTALLABLE_API_TOKEN || "").trim());
  console.log("THEEB_INSTALLABLE_API_VALIDATED");
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.code || error.message);
    process.exit(1);
  });
}

module.exports = {
  parseInstallableBase,
  isPrivateAddress,
  validateReachability,
  main
};
