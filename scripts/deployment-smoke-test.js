const { URL } = require("node:url");

function deploymentBaseUrl(env = process.env) {
  if (!env.THEEB_BASE_URL) {
    throw Object.assign(new Error("THEEB_BASE_URL_REQUIRED"), {
      code: "THEEB_BASE_URL_REQUIRED"
    });
  }

  const url = new URL(env.THEEB_BASE_URL);
  if (url.username || url.password) {
    throw Object.assign(new Error("BASE_URL_CREDENTIALS_FORBIDDEN"), {
      code: "BASE_URL_CREDENTIALS_FORBIDDEN"
    });
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw Object.assign(new Error("HTTPS_BASE_URL_REQUIRED"), {
      code: "HTTPS_BASE_URL_REQUIRED"
    });
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

async function readText(base, path, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 10000);
  const response = await fetch(new URL(path, `${base.href}/`), {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.1" },
    redirect: "error"
  });
  const body = await response.text();
  if (!response.ok) {
    throw Object.assign(new Error(`HTTP_${response.status}: ${path}`), {
      code: `HTTP_${response.status}`,
      path,
      body
    });
  }
  return { response, body };
}

async function readJson(base, path, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 10000);
  const response = await fetch(new URL(path, `${base.href}/`), {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
    redirect: "error"
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw Object.assign(new Error(`INVALID_JSON: ${path}`), {
      code: "INVALID_JSON",
      path
    });
  }
  if (!response.ok) {
    throw Object.assign(new Error(`HTTP_${response.status}: ${path}`), {
      code: `HTTP_${response.status}`,
      path,
      body
    });
  }
  return body;
}

async function smokeTest(env = process.env, options = {}) {
  const base = deploymentBaseUrl(env);
  const live = await readJson(base, "/livez", options);
  const ready = await readJson(base, "/readyz", options);
  const api = await readJson(base, "/api", options);
  const web = await readText(base, "/", options);

  if (live.status !== "alive") throw new Error("LIVENESS_CONTRACT_FAILED");
  if (ready.status !== "ready") throw new Error("READINESS_CONTRACT_FAILED");
  if (api.name !== "Theeb Engine") throw new Error("API_METADATA_CONTRACT_FAILED");
  if (!/ذيب العرب/.test(web.body) || !/app\.webmanifest/.test(web.body)) {
    throw new Error("WEB_ROOT_CONTRACT_FAILED");
  }
  if (env.THEEB_EXPECTED_VERSION && api.version !== env.THEEB_EXPECTED_VERSION) {
    throw new Error("DEPLOYED_VERSION_MISMATCH");
  }

  return {
    status: "passed",
    base_url: base.origin,
    version: api.version,
    providers: Array.isArray(api.providers) ? api.providers.length : null,
    database: ready.database,
    web: "theeb-arab-pwa"
  };
}

if (require.main === module) {
  smokeTest().then(result => {
    console.log(JSON.stringify(result));
  }).catch(error => {
    console.error(JSON.stringify({
      status: "failed",
      error: error.code || error.message
    }));
    process.exitCode = 1;
  });
}

module.exports = { deploymentBaseUrl, readText, readJson, smokeTest };
