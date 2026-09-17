'use strict';

const RESOLUTION_POINTS = Object.freeze({
  '2160p': 100,
  '4k': 100,
  '1440p': 80,
  '1080p': 65,
  '720p': 40,
  '480p': 15,
});

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function qualityPoints(candidate = {}) {
  const haystack = [candidate.quality, candidate.label, candidate.title, candidate.url]
    .filter(Boolean).join(' ').toLowerCase();
  let score = 0;
  for (const [token, points] of Object.entries(RESOLUTION_POINTS)) {
    if (haystack.includes(token)) score = Math.max(score, points);
  }
  if (/remux|blu[ -]?ray/.test(haystack)) score += 45;
  else if (/web[ ._-]?dl/.test(haystack)) score += 25;
  if (/dolby[ ._-]?vision|\bdv\b/.test(haystack)) score += 20;
  if (/hdr10\+?|\bhdr\b/.test(haystack)) score += 15;
  if (/truehd|atmos/.test(haystack)) score += 15;
  if (/hevc|h[ ._-]?265|x265/.test(haystack)) score += 10;
  if (/camrip|\bcam\b|telesync|\bts\b/.test(haystack)) score -= 60;
  return clamp(score, 0, 200);
}

function healthPoints(candidate = {}) {
  const health = candidate.health || {};
  const successRate = clamp(health.successRate ?? candidate.successRate ?? 0.5, 0, 1);
  const latencyMs = clamp(health.latencyMs ?? candidate.latencyMs ?? 1500, 0, 30000);
  const verified = health.verified ?? candidate.verified ?? false;
  const freshnessMs = candidate.verifiedAt ? Math.max(0, Date.now() - new Date(candidate.verifiedAt).getTime()) : null;

  let score = successRate * 100;
  score += Math.max(0, 50 - latencyMs / 100);
  if (verified) score += 30;
  if (freshnessMs !== null && Number.isFinite(freshnessMs)) {
    const hours = freshnessMs / 3600000;
    score += Math.max(0, 30 - hours);
  }
  return clamp(score, 0, 210);
}

function capabilityPoints(candidate = {}, intent = 'watch') {
  const capabilities = candidate.capabilities || {};
  if (intent === 'download') return capabilities.download === false ? -100 : capabilities.download === true ? 20 : 0;
  return capabilities.watch === false ? -100 : capabilities.watch === true ? 20 : 0;
}

function scoreResource(candidate = {}, options = {}) {
  const intent = options.intent === 'download' ? 'download' : 'watch';
  const components = {
    quality: qualityPoints(candidate),
    health: healthPoints(candidate),
    capability: capabilityPoints(candidate, intent),
  };
  const total = components.quality + components.health + components.capability;
  return { total: Math.round(total * 100) / 100, components, intent };
}

function rankResources(candidates = [], options = {}) {
  return candidates.map((candidate, index) => ({
    ...candidate,
    resourceScore: scoreResource(candidate, options),
    _stableOrder: index,
  })).sort((a, b) => b.resourceScore.total - a.resourceScore.total || a._stableOrder - b._stableOrder)
    .map(({ _stableOrder, ...candidate }) => candidate);
}

module.exports = { scoreResource, rankResources, qualityPoints, healthPoints };
