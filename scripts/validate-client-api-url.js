const dns = require("node:dns").promises;
const { privateAddress } = require("../src/services/safe-media-request");

const FORBIDDEN_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "example.com",
  "www.example.com"
]);

function validateClientApiUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) throw new Error("THEEB_API_BASE_URL_REQUIRED");

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("THEEB_API_BASE_URL_INVALID");
  }

  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:") throw new Error("THEEB_API_BASE_URL_HTTPS_REQUIRED");
  if (url.username || url.password) throw new Error("THEEB_API_BASE_URL_CREDENTIALS_FORBIDDEN");
  if (url.search || url.hash) throw new Error("THEEB_API_BASE_URL_INVALID");
  if (
    FORBIDDEN_HOSTS.has(host) ||
    host.endsWith(".invalid") ||
    host.endsWith(".test") ||
    host.endsWith(".example") ||
    host.endsWith(".local")
  ) {
    throw new Error("THEEB_API_BASE_URL_PLACEHOLDER");
  }

  url.pathname = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
  return url;
}

async function validatePublicDns(url, lookup = dns.lookup) {
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error("THEEB_API_DNS_EMPTY");
  if (records.some(record => privateAddress(record.address))) {
    throw new Error("THEEB_API_DNS_PRIVATE_ADDRESS");
  }
  return records;
}

async function readJson(base, path, options = {}) {
  const response = await fetch(new URL(path.replace(/^\//, ""), base), {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(Number(options.timeoutMs || 10000))
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    throw new Error("THEEB_API_INVALID_JSON");
  }
  if (!response.ok) throw new Error("THEEB_API_HTTP_" + response.status);
  return body;
}

async function probeClientApi(raw, options = {}) {
  const url = validateClientApiUrl(raw);
  await validatePublicDns(url, options.lookup || dns.lookup);
  const live = await readJson(url, "/livez", options);
  const ready = await readJson(url, "/readyz", options);
  const search = await readJson(url, "/v1/search?q=theeb", options);

  if (live.status !== "alive") throw new Error("THEEB_API_LIVENESS_FAILED");
  if (ready.status !== "ready") throw new Error("THEEB_API_READINESS_FAILED");
  if (!search?.data || !Array.isArray(search.data.items)) {
    throw new Error("THEEB_API_SEARCH_CONTRACT_FAILED");
  }

  return {
    base_url: url.origin,
    database: ready.database,
    search_count: search.data.items.length
  };
}

if (require.main === module) {
  const raw = process.argv[2] || process.env.THEEB_API_BASE_URL;
  const probe = process.argv.includes("--probe");
  Promise.resolve(probe ? probeClientApi(raw) : validateClientApiUrl(raw))
    .then(result => {
      console.log(JSON.stringify({
        status: "passed",
        base_url: result instanceof URL ? result.origin : result.base_url,
        ...(result instanceof URL ? {} : result)
      }));
    })
    .catch(error => {
      console.error(JSON.stringify({
        status: "failed",
        error: error.code || error.message
      }));
      process.exitCode = 1;
    });
}

module.exports = {
  probeClientApi,
  validateClientApiUrl,
  validatePublicDns
};
