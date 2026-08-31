const values = new Map();
const FORBIDDEN_LABEL = /url|token|secret|password|authorization|cookie/i;

function normalizedLabels(labels = {}) {
  const safe = Object.fromEntries(Object.entries(labels)
    .filter(([key, value]) => !FORBIDDEN_LABEL.test(key) && /^[a-z_][a-z0-9_]*$/i.test(key) && /^[a-z0-9_.:-]{0,64}$/i.test(String(value)))
    .sort(([a], [b]) => a.localeCompare(b)));
  return safe;
}

function increment(name, labels = {}, amount = 1) {
  const safeLabels = normalizedLabels(labels);
  const key = `${name}|${JSON.stringify(safeLabels)}`;
  const current = values.get(key) || { name, labels: safeLabels, value: 0 };
  current.value += amount;
  values.set(key, current);
}

function snapshot() {
  return [...values.values()].map(item => ({ ...item, labels: { ...item.labels } }));
}

function prometheus() {
  return snapshot().map(({ name, labels, value }) => {
    const list = Object.entries(labels).map(([key, item]) => `${key}="${item}"`).join(",");
    return `${name}${list ? `{${list}}` : ""} ${value}`;
  }).join("\n") + "\n";
}

function reset() { values.clear(); }

module.exports = { increment, snapshot, prometheus, reset };
