const {
  spawn
} = require("node:child_process");

const {
  resolveEpisode
} = require(
  "../src/services/episode-resolver"
);

const {
  recordVerification
} = require(
  "../src/services/playback-verification-store"
);

function delay(ms) {
  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );
}

async function waitForChrome(
  port,
  timeoutMs = 15000
) {
  const started = Date.now();

  while (
    Date.now() - started <
    timeoutMs
  ) {
    try {
      const response =
        await fetch(
          `http://127.0.0.1:${port}/json/list`
        );

      if (response.ok) {
        return response.json();
      }
    } catch {
      // Chrome is still starting.
    }

    await delay(250);
  }

  throw new Error(
    "CHROME_START_TIMEOUT"
  );
}

function cdpClient(url) {
  const socket =
    new WebSocket(url);

  let nextId = 1;
  const pending =
    new Map();
  const listeners =
    new Map();

  socket.addEventListener(
    "message",
    event => {
      const message =
        JSON.parse(event.data);

      if (
        message.id &&
        pending.has(message.id)
      ) {
        const {
          resolve,
          reject,
          timer
        } = pending.get(
          message.id
        );

        pending.delete(message.id);
        clearTimeout(timer);

        if (message.error) {
          reject(
            new Error(
              message.error.message
            )
          );
        } else {
          resolve(
            message.result || {}
          );
        }

        return;
      }

      const callbacks =
        listeners.get(
          message.method
        ) || [];

      callbacks.forEach(
        callback =>
          callback(
            message.params || {}
          )
      );
    }
  );

  function send(
    method,
    params = {},
    timeoutMs = 10000
  ) {
    return new Promise(
      (resolve, reject) => {
        const id = nextId++;

        const timer = setTimeout(() => {
          pending.delete(id);
          reject(
            new Error(
              `CDP_COMMAND_TIMEOUT: ${method}`
            )
          );
        }, timeoutMs);

        pending.set(
          id,
          {
            resolve,
            reject,
            timer
          }
        );

        socket.send(
          JSON.stringify({
            id,
            method,
            params
          })
        );
      }
    );
  }

  function on(method, callback) {
    const callbacks =
      listeners.get(method) ||
      [];

    callbacks.push(callback);
    listeners.set(
      method,
      callbacks
    );
  }

  return {
    ready:
      new Promise(
        (resolve, reject) => {
          socket.addEventListener(
            "open",
            resolve,
            { once: true }
          );

          socket.addEventListener(
            "error",
            reject,
            { once: true }
          );
        }
      ),
    send,
    on,
    close() {
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(new Error("CDP_CONNECTION_CLOSED"));
      }
      pending.clear();
      socket.close();
    }
  };
}

async function probe(
  url,
  options = {}
) {
  const port =
    Number(
      options.port || 9222
    );

  const chromePath =
    options.chromePath ||
    process.env.CHROME_PATH ||
    "google-chrome";

  const chrome =
    spawn(
      chromePath,
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--mute-audio",
        "--autoplay-policy=no-user-gesture-required",
        `--remote-debugging-port=${port}`,
        "about:blank"
      ],
      {
        stdio: [
          "ignore",
          "ignore",
          "pipe"
        ]
      }
    );

  let chromeError = "";

  chrome.stderr.on(
    "data",
    chunk => {
      chromeError += chunk;
    }
  );

  let client;

  try {
    const pages =
      await waitForChrome(port);

    const page =
      pages.find(
        item =>
          item.type === "page"
      );

    if (!page) {
      throw new Error(
        "CHROME_PAGE_TARGET_MISSING"
      );
    }

    client =
      cdpClient(
        page.webSocketDebuggerUrl
      );

    await client.ready;

    const contexts =
      new Set();

    client.on(
      "Runtime.executionContextCreated",
      ({ context }) => {
        if (context?.id) {
          contexts.add(
            context.id
          );
        }
      }
    );

    client.on(
      "Runtime.executionContextDestroyed",
      ({ executionContextId }) => {
        contexts.delete(
          executionContextId
        );
      }
    );

    await client.send(
      "Runtime.enable"
    );

    await client.send(
      "Page.enable"
    );

    await client.send(
      "Page.navigate",
      { url }
    );

    const started = Date.now();
    const timeoutMs =
      Number(
        options.timeoutMs ||
        30000
      );

    const result = {
      embed_status:
        "reachable",
      playback_status:
        "unverified",
      video_element_discovered:
        false,
      loadedmetadata:
        false,
      canplay:
        false,
      playing:
        false,
      max_current_time:
        0,
      checked_at:
        new Date().toISOString()
    };

    while (
      Date.now() - started <
      timeoutMs
    ) {
      for (
        const contextId of
        [...contexts]
      ) {
        try {
          const evaluation =
            await client.send(
              "Runtime.evaluate",
              {
                contextId,
                returnByValue: true,
                awaitPromise: true,
                expression: `
                  (async () => {
                    const video =
                      document.querySelector("video");

                    if (!video) {
                      return {
                        found: false
                      };
                    }

                    try {
                      await video.play();
                    } catch {}

                    return {
                      found: true,
                      readyState:
                        video.readyState,
                      currentTime:
                        Number(
                          video.currentTime || 0
                        ),
                      paused:
                        video.paused,
                      duration:
                        Number.isFinite(
                          video.duration
                        )
                          ? video.duration
                          : null
                    };
                  })()
                `
              }
            );

          const state =
            evaluation.result
              ?.value;

          if (!state?.found) {
            continue;
          }

          result
            .video_element_discovered =
            true;

          result.loadedmetadata =
            result.loadedmetadata ||
            state.readyState >= 1;

          result.canplay =
            result.canplay ||
            state.readyState >= 3;

          result.playing =
            result.playing ||
            !state.paused;

          result.max_current_time =
            Math.max(
              result.max_current_time,
              state.currentTime || 0
            );

          if (
            result.max_current_time >
            2
          ) {
            result.playback_status =
              "verified";

            result.health =
              "PLAYBACK_VERIFIED";

            result.latency_ms =
              Date.now() -
              started;

            return result;
          }
        } catch {
          contexts.delete(
            contextId
          );
        }
      }

      await delay(500);
    }

    result.health =
      result.video_element_discovered
        ? "DEGRADED"
        : "REACHABLE";

    result.latency_ms =
      Date.now() - started;

    return result;
  } finally {
    client?.close();
    chrome.kill("SIGTERM");

    await Promise.race([
      new Promise(
        resolve =>
          chrome.once(
            "close",
            resolve
          )
      ),
      delay(3000)
    ]);

    if (
      chrome.exitCode &&
      chrome.exitCode !== 0 &&
      !client
    ) {
      throw new Error(
        `CHROME_FAILED: ${
          chromeError
            .trim()
            .slice(0, 300)
        }`
      );
    }
  }
}

async function main() {
  const episode =
    Number(
      process.env.EPISODE || 1
    );

  const resolved =
    await resolveEpisode({
      query: "Lucky",
      groupKey:
        "series:lucky",
      season: 1,
      episode
    });

  const candidates =
    resolved.playback_plan
      .filter(
        item =>
          item.provider ===
            "wecima" &&
          item.type === "embed"
      )
      .slice(0, 3);

  if (candidates.length === 0) {
    throw new Error(
      "WECIMA_EMBED_CANDIDATE_NOT_FOUND"
    );
  }

  const results = [];

  for (
    const candidate of candidates
  ) {
    const parsed =
      new URL(
        candidate.embed_url
      );

    const result =
      await probe(
        candidate.embed_url
      );

    const stored =
      await recordVerification(
        candidate,
        result
      );

    results.push({
      provider:
        candidate.provider,
      server:
        candidate.server,
      hostname:
        parsed.hostname,
      result,
      stored_health: {
        health_state:
          stored.health_state,
        checked_at:
          stored.checked_at,
        fresh:
          stored.fresh,
        age_seconds:
          stored.age_seconds
      }
    });

    if (
      results.at(-1)
        .result
        .playback_status ===
      "verified"
    ) {
      break;
    }
  }

  console.log(
    JSON.stringify(
      {
        episode,
        results
      },
      null,
      2
    )
  );

  if (
    !results.some(
      item =>
        item.result
          .playback_status ===
        "verified"
    )
  ) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(
      JSON.stringify({
        error:
          error.message
      })
    );

    process.exitCode = 1;
  });
}

module.exports = {
  cdpClient,
  probe
};
