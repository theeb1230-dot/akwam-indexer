'use strict';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function providerHealthConfidence(row) {
  if (!row || typeof row !== 'object') {
    return { known: false, score: 50, success_rate: null, avg_latency_ms: null, samples: 0 };
  }

  const successes = Math.max(0, number(row.successes));
  const failures = Math.max(0, number(row.failures));
  const samples = successes + failures;
  const latency = Math.max(0, number(row.avg_latency_ms, 1500));

  if (samples === 0) {
    return { known: false, score: 50, success_rate: null, avg_latency_ms: latency, samples: 0 };
  }

  const successRate = successes / samples;
  const reliability = successRate * 80;
  const latencyBonus = clamp(20 - latency / 150, 0, 20);

  return {
    known: true,
    score: Math.round(clamp(reliability + latencyBonus, 0, 100)),
    success_rate: Number(successRate.toFixed(4)),
    avg_latency_ms: latency,
    samples
  };
}

function healthByProvider(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const provider = String(row?.provider || '').trim().toLowerCase();
    if (!provider) continue;
    map.set(provider, providerHealthConfidence(row));
  }
  return map;
}

function annotateSearchResults(items, healthRows) {
  const health = healthByProvider(healthRows);
  return (Array.isArray(items) ? items : []).map((item) => {
    const provider = String(item?.search_provider || item?.provider || '').trim().toLowerCase();
    return {
      ...item,
      provider_health: health.get(provider) || providerHealthConfidence(null)
    };
  });
}

function rankSearchResults(items, healthRows) {
  return annotateSearchResults(items, healthRows)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const matchDelta = number(b.item.match_score) - number(a.item.match_score);
      if (matchDelta !== 0) return matchDelta;
      const healthDelta = number(b.item.provider_health?.score, 50) - number(a.item.provider_health?.score, 50);
      if (healthDelta !== 0) return healthDelta;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

module.exports = {
  providerHealthConfidence,
  healthByProvider,
  annotateSearchResults,
  rankSearchResults
};
