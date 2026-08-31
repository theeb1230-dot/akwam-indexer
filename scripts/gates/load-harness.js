const { performance } = require("node:perf_hooks");
const { buildPlaybackPlan, normalizePlaybackSource } = require("../../src/services/episode-resolver");

async function runLoad(options = {}) {
  const operations = Number(options.operations || process.env.GATE_LOAD_OPERATIONS || 2000);
  const concurrency = Number(options.concurrency || process.env.GATE_LOAD_CONCURRENCY || 25);
  if (!Number.isInteger(operations) || operations < 1 || operations > 100000) throw new Error("INVALID_LOAD_OPERATIONS");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 200) throw new Error("INVALID_LOAD_CONCURRENCY");
  let cursor = 0;
  let completed = 0;
  const latencies = [];
  const started = performance.now();
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= operations) return;
      const begin = performance.now();
      const plan = buildPlaybackPlan([{ provider: "fixture", episode: { id: `e${index}` }, watch_options: [{ watch_id: `w${index}`, sources: [
        normalizePlaybackSource({ type: "embed", server: "b", priority: 2, embed_url: "https://example.test/b" }),
        normalizePlaybackSource({ type: "video/mp4", quality: "720p", direct_url: "https://example.test/a.mp4" })
      ] }] }]);
      if (plan.length !== 2 || plan[0].type !== "direct_mp4") throw new Error("LOAD_RESULT_MISMATCH");
      latencies.push(performance.now() - begin);
      completed++;
      if (index % 100 === 0) await new Promise(resolve => setImmediate(resolve));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsedMs = performance.now() - started;
  latencies.sort((a, b) => a - b);
  const p95Ms = latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)];
  if (completed !== operations || elapsedMs > 30000) throw new Error("LOAD_GATE_BUDGET_EXCEEDED");
  return { gate: "load", status: "passed", operations, concurrency, completed, elapsed_ms: Math.round(elapsedMs), p95_ms: Number(p95Ms.toFixed(3)) };
}

if (require.main === module) {
  runLoad().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(JSON.stringify({ gate: "load", status: "failed", error: error.message }));
    process.exitCode = 1;
  });
}

module.exports = { runLoad };
