const { URL } = require("node:url");

function deploymentBaseUrl(env = process.env) {
  if (!env.THEEB_BASE_URL) {
    throw Object.assign(new Error("THEEB_BASE_URL_REQUIRED"), {
      code: "THEEB_BASE_URL_REQUIRED"
    });
  }

  const url = new URL(env.THEEB_BASE_URL);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
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
  const root = await readJson(base, "/", options);

  if (live.status !== "alive") throw new Error("LIVENESS_CONTRACT_FAILED");
  if (ready.status !== "ready") throw new Error("READINESS_CONTRACT_FAILED");
  if (root.name !== "Theeb Engine") throw new Error("ROOT_CONTRACT_FAILED");
  if (env.THEEB_EXPECTED_VERSION && root.version !== env.THEEB_EXPECTED_VERSION) {
    throw new Error("DEPLOYED_VERSION_MISMATCH");
  }

  return {
    status: "passed",
    base_url: base.origin,
    version: root.version,
    providers: Array.isArray(root.providers) ? root.providers.length : null,
    database: ready.database
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

module.exports = { deploymentBaseUrl, readJson, smokeTest };
