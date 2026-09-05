const { closePool } = require("../db/postgres");

function shutdownTimeoutMs(options = {}, processRef = process) {
  const raw = options.timeoutMs ?? processRef.env.SHUTDOWN_TIMEOUT_MS ?? 25000;
  const timeoutMs = Number(raw);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    const error = new Error("INVALID_SHUTDOWN_TIMEOUT_MS");
    error.code = "INVALID_SHUTDOWN_TIMEOUT_MS";
    throw error;
  }
  return timeoutMs;
}

function installShutdownHandlers(options = {}) {
  const processRef = options.processRef || process;
  const controller = options.controller;
  const server = options.server;
  const completion = options.completion;
  const timeoutMs = shutdownTimeoutMs(options, processRef);
  let stopping;

  async function shutdown(signal) {
    if (stopping) return stopping;

    stopping = (async () => {
      console.log(JSON.stringify({ level: "info", event: "shutdown_started", signal }));
      controller?.abort(signal);
      server?.stopAcceptingTraffic?.();
      server?.closeIdleConnections?.();

      const closeServer = new Promise((resolve, reject) => {
        if (!server) return resolve();
        server.close(error => error ? reject(error) : resolve());
      });

      let timeout;
      const timedOut = new Promise(resolve => {
        timeout = setTimeout(() => resolve("timeout"), timeoutMs);
      });

      const drained = completion && typeof completion.then === "function"
        ? Promise.all([closeServer, completion])
        : closeServer;

      const outcome = await Promise.race([
        Promise.resolve(drained).then(() => "drained"),
        timedOut
      ]);
      clearTimeout(timeout);

      if (outcome === "timeout") {
        server?.closeAllConnections?.();
        const error = new Error("GRACEFUL_SHUTDOWN_TIMEOUT");
        error.code = "GRACEFUL_SHUTDOWN_TIMEOUT";
        throw error;
      }

      console.log(JSON.stringify({ level: "info", event: "shutdown_complete", signal }));
    })().catch(error => {
      console.error(JSON.stringify({
        level: "error",
        event: "shutdown_failed",
        signal,
        error: error.code || error.message
      }));
      processRef.exitCode = 1;
    }).finally(() => closePool().catch(error => {
      console.error(JSON.stringify({
        level: "error",
        event: "postgres_pool_close_failed",
        error: error.code || error.message
      }));
      processRef.exitCode = 1;
    }));

    return stopping;
  }

  for (const signal of ["SIGTERM", "SIGINT"]) {
    processRef.once(signal, () => void shutdown(signal));
  }

  return shutdown;
}

module.exports = { installShutdownHandlers, shutdownTimeoutMs };
