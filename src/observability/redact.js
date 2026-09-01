const SECRET_KEY = /authorization|cookie|token|secret|password|direct_url|embed_url|page_url|source_url|url/i;
const SENSITIVE_VALUE = /(?:https?:\/\/|bearer\s+|(?:token|secret|password)=)/i;

function redactString(value) {
  if (SENSITIVE_VALUE.test(value)) return "[redacted]";
  return value.length > 512 ? `${value.slice(0, 512)}…` : value;
}

function redact(value, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (depth >= 6) return "[truncated]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.slice(0, 50).map(item => redact(item, seen, depth + 1));
    if (value.length > 50) result.push(`[${value.length - 50} more items]`);
    return result;
  }

  return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, item]) => [
    key,
    SECRET_KEY.test(key) ? "[redacted]" : redact(item, seen, depth + 1)
  ]));
}

module.exports = { redact, redactString, SECRET_KEY };
