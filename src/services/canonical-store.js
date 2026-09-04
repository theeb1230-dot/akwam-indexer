const {
  createCanonicalRepository
} = require("../repositories/canonical-repository");

const repository = createCanonicalRepository();

function canonicalKey(result) {
  const key = String(
    result?.canonical_key || result?.group_key || ""
  ).trim();

  if (!key) throw new Error("CANONICAL_KEY_REQUIRED");
  return key;
}

async function saveResolvedSeries(result, options = {}) {
  const store = options.repository || repository;
  return store.saveResolvedSeries(result, canonicalKey(result));
}

async function saveResolvedEpisode(result, options = {}) {
  const store = options.repository || repository;
  return store.saveResolvedEpisode(result, canonicalKey(result));
}

module.exports = {
  canonicalKey,
  saveResolvedSeries,
  saveResolvedEpisode
};
