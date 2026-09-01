const { redact } = require("./redact");

function write(level, event, fields = {}) {
  const normalizedLevel = ["info", "warn", "error"].includes(level) ? level : "info";
  const normalizedEvent = /^[a-z0-9_.:-]{1,80}$/i.test(String(event))
    ? String(event)
    : "invalid_event";
  const record = {
    ...redact(fields && typeof fields === "object" ? fields : {}),
    timestamp: new Date().toISOString(),
    level: normalizedLevel,
    event: normalizedEvent
  };
  const line = JSON.stringify(record);
  (normalizedLevel === "error" ? console.error : console.log)(line);
  return record;
}

module.exports = {
  info: (event, fields) => write("info", event, fields),
  warn: (event, fields) => write("warn", event, fields),
  error: (event, fields) => write("error", event, fields),
  write
};
