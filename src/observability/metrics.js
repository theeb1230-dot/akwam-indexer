const values = new Map();
const histograms = new Map();
const FORBIDDEN_LABEL = /url|token|secret|password|authorization|cookie/i;
const METRIC_NAME = /^[a-z_:][a-z0-9_:]*$/i;
const MAX_LABELS = 6;
const MAX_SERIES_PER_METRIC = 200;
const BOUNDED_VALUES = Object.freeze({
  method: new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "OTHER"]),
  event: new Set(["player_opened", "first_frame", "playing", "buffering", "stalled", "ended", "fatal_error", "other"]),
  platform: new Set(["android_mobile", "android_tv", "ios", "web", "windows", "unknown"])
});
const BOUNDED_FALLBACK = Object.freeze({ method: "OTHER", event: "other", platform: "unknown" });

function normalizedLabels(labels = {}) {
  return Object.fromEntries(Object.entries(labels)
    .filter(([key, value]) => (
      !FORBIDDEN_LABEL.test(key) &&
      /^[a-z_][a-z0-9_]*$/i.test(key) &&
      /^[a-z0-9_.:-]{0,64}$/i.test(String(value))
    ))
    .slice(0, MAX_LABELS)
    .map(([key, value]) => {
      const stringValue = String(value);
      const allowed = BOUNDED_VALUES[key];
      return [key, allowed && !allowed.has(stringValue)
        ? BOUNDED_FALLBACK[key]
        : stringValue];
    })
    .sort(([a], [b]) => a.localeCompare(b)));
}

function assertName(name) {
  if (!METRIC_NAME.test(String(name))) throw new Error("INVALID_METRIC_NAME");
}

function keyFor(name, labels) {
  return `${name}|${JSON.stringify(labels)}`;
}

function boundedKey(store, name, labels) {
  const key = keyFor(name, labels);
  if (store.has(key)) return { key, labels };
  let count = 0;
  for (const item of store.values()) if (item.name === name) count += 1;
  if (count < MAX_SERIES_PER_METRIC - 1) return { key, labels };
  const overflow = { overflow: "true" };
  return { key: keyFor(name, overflow), labels: overflow };
}

function increment(name, labels = {}, amount = 1) {
  assertName(name);
  if (!Number.isFinite(amount)) throw new Error("INVALID_METRIC_AMOUNT");
  const bounded = boundedKey(values, name, normalizedLabels(labels));
  const { key } = bounded;
  const safeLabels = bounded.labels;
  const current = values.get(key) || { name, labels: safeLabels, value: 0 };
  current.value += amount;
  values.set(key, current);
}

function observe(name, labels = {}, value, buckets = [50, 100, 250, 500, 1000, 2500, 5000]) {
  assertName(name);
  if (!Number.isFinite(value) || value < 0) throw new Error("INVALID_METRIC_OBSERVATION");
  const bounded = boundedKey(histograms, name, normalizedLabels(labels));
  const safeLabels = bounded.labels;
  const normalizedBuckets = [...new Set(buckets)].filter(Number.isFinite).sort((a, b) => a - b);
  const { key } = bounded;
  const current = histograms.get(key) || {
    name, labels: safeLabels, count: 0, sum: 0,
    buckets: normalizedBuckets.map(le => ({ le, count: 0 }))
  };
  current.count += 1;
  current.sum += value;
  for (const bucket of current.buckets) if (value <= bucket.le) bucket.count += 1;
  histograms.set(key, current);
}

function snapshot() {
  return [
    ...values.values().map(item => ({ ...item, labels: { ...item.labels }, type: "counter" })),
    ...histograms.values().map(item => ({
      ...item, labels: { ...item.labels }, buckets: item.buckets.map(bucket => ({ ...bucket })), type: "histogram"
    }))
  ];
}

function labelText(labels) {
  const list = Object.entries(labels).map(([key, item]) => `${key}="${item}"`).join(",");
  return list ? `{${list}}` : "";
}

function prometheus() {
  const lines = [];
  for (const { name, labels, value } of values.values()) {
    lines.push(`${name}${labelText(labels)} ${value}`);
  }
  for (const item of histograms.values()) {
    for (const bucket of item.buckets) {
      lines.push(`${item.name}_bucket${labelText({ ...item.labels, le: bucket.le })} ${bucket.count}`);
    }
    lines.push(`${item.name}_bucket${labelText({ ...item.labels, le: "+Inf" })} ${item.count}`);
    lines.push(`${item.name}_sum${labelText(item.labels)} ${item.sum}`);
    lines.push(`${item.name}_count${labelText(item.labels)} ${item.count}`);
  }
  return `${lines.join("\n")}\n`;
}

function reset() {
  values.clear();
  histograms.clear();
}

module.exports = {
  increment, normalizedLabels, observe, snapshot, prometheus, reset,
  MAX_SERIES_PER_METRIC
};
