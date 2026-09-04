const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const express = require("express");
const { cdpClient } = require("./wecima-browser-probe");

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForChrome(port, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) return response.json();
    } catch {}
    await delay(250);
  }
  throw new Error("CHROME_START_TIMEOUT");
}

async function main() {
  const app = express();
  const webRoot = path.join(process.cwd(), "web");

  app.get("/livez", (_req, res) => res.json({ status: "ok" }));
  app.get("/v1/search", (req, res) => {
    res.json({
      data: {
        count: 1,
        items: [{
          id: 1,
          title: req.query.q || "Fixture",
          content_type: "series",
          episode_count: 1
        }]
      }
    });
  });
  app.get("/v1/series/1", (_req, res) => {
    res.json({ data: { id: 1, title: "Fixture Series", content_type: "series" } });
  });
  app.get("/v1/series/1/episodes", (_req, res) => {
    res.json({
      data: {
        items: [{
          id: 10,
          episode_number: 1,
          title: "Episode 1",
          watch_available: true,
          download_available: true
        }]
      }
    });
  });
  app.get("/v1/episodes/10", (_req, res) => {
    res.json({
      data: {
        id: 10,
        episode_number: 1,
        title: "Episode 1",
        watch_available: true,
        download_available: true
      }
    });
  });
  app.use(express.static(webRoot, { index: "index.html" }));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const chromePort = 9333;
  const chromePath = process.env.CHROME_PATH || "google-chrome";
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${chromePort}`,
    `http://127.0.0.1:${port}/`
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let client;
  try {
    const pages = await waitForChrome(chromePort);
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("CHROME_PAGE_TARGET_MISSING");

    client = cdpClient(page.webSocketDebuggerUrl);
    await client.ready;
    await client.send("Runtime.enable");
    await client.send("Page.enable");

    await delay(1000);
    let result = await client.send("Runtime.evaluate", {
      returnByValue: true,
      awaitPromise: true,
      expression: `(async () => {
        const manifest = document.querySelector('link[rel="manifest"]');
        const input = document.querySelector('#searchInput');
        const form = document.querySelector('#searchForm');
        input.value = 'Fixture';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 500));
        return {
          title: document.title,
          lang: document.documentElement.lang,
          dir: document.documentElement.dir,
          manifest: manifest && manifest.getAttribute('href'),
          resultText: document.querySelector('#results')?.textContent || '',
          serviceWorker: 'serviceWorker' in navigator
        };
      })()`
    });

    const value = result.result?.value || {};
    if (value.title !== "ذيب العرب") throw new Error("WEB_SMOKE_TITLE_MISMATCH");
    if (value.lang !== "ar" || value.dir !== "rtl") throw new Error("WEB_SMOKE_LOCALE_MISMATCH");
    if (value.manifest !== "/app.webmanifest") throw new Error("WEB_SMOKE_MANIFEST_MISSING");
    if (!value.resultText.includes("Fixture")) throw new Error("WEB_SMOKE_SEARCH_FLOW_FAILED");
    if (!value.serviceWorker) throw new Error("WEB_SMOKE_SERVICE_WORKER_UNAVAILABLE");

    result = await client.send("Runtime.evaluate", {
      returnByValue: true,
      awaitPromise: true,
      expression: `(async () => {
        const link = document.querySelector('.primary-action');
        link.click();
        await new Promise(r => setTimeout(r, 500));
        const episode = document.querySelector('.episode-row');
        if (episode) episode.click();
        await new Promise(r => setTimeout(r, 500));
        return {
          series: document.querySelector('#seriesDetail')?.textContent || '',
          episode: document.querySelector('#episodeDetail')?.textContent || ''
        };
      })()`
    });

    const detail = result.result?.value || {};
    if (!detail.series.includes("Fixture Series")) throw new Error("WEB_SMOKE_SERIES_FLOW_FAILED");
    if (!detail.episode.includes("Episode 1")) throw new Error("WEB_SMOKE_EPISODE_FLOW_FAILED");

    console.log(JSON.stringify({ status: "ok", url: `http://127.0.0.1:${port}/` }));
  } finally {
    client?.close();
    chrome.kill("SIGTERM");
    server.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  });
}
