const { classifyFailure, retryPolicy } = require("../../src/services/failure-classifier");
const { calculateMatchScore } = require("../../src/services/search-orchestrator");

async function runSoak(options = {}) {
  const cycles = Number(options.cycles || process.env.GATE_SOAK_CYCLES || 10000);
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 1000000) throw new Error("INVALID_SOAK_CYCLES");
  const before = process.memoryUsage().heapUsed;
  const started = Date.now();
  let assertions = 0;
  for (let index = 0; index < cycles; index++) {
    const failure = classifyFailure(index % 2 ? { code: "ETIMEDOUT" } : { response: { status: 404 } });
    if (!retryPolicy(failure).fallback) throw new Error("SOAK_POLICY_MISMATCH");
    if (calculateMatchScore("Lucky", "Lucky Hank") >= 70) throw new Error("SOAK_SCORING_REGRESSION");
    assertions += 2;
    if (index % 500 === 0) await new Promise(resolve => setImmediate(resolve));
  }
  const elapsedMs = Date.now() - started;
  const heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - before);
  if (elapsedMs > 30000 || heapGrowthBytes > 128 * 1024 * 1024) throw new Error("SOAK_GATE_BUDGET_EXCEEDED");
  return { gate: "soak", status: "passed", cycles, assertions, elapsed_ms: elapsedMs, heap_growth_bytes: heapGrowthBytes };
}

if (require.main === module) {
  runSoak().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(JSON.stringify({ gate: "soak", status: "failed", error: error.message }));
    process.exitCode = 1;
  });
}

module.exports = { runSoak };
