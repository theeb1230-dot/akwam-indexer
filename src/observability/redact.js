const SECRET_KEY = /authorization|cookie|token|secret|password|direct_url|embed_url|page_url|source_url|url/i;

function redact(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`;
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map(item => redact(item, seen));

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SECRET_KEY.test(key) ? "[redacted]" : redact(item, seen)
  ]));
}

module.exports = { redact, SECRET_KEY };
