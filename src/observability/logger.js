const { redact } = require("./redact");

function write(level, event, fields = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...redact(fields)
  };
  const line = JSON.stringify(record);
  (level === "error" ? console.error : console.log)(line);
  return record;
}

module.exports = {
  info: (event, fields) => write("info", event, fields),
  warn: (event, fields) => write("warn", event, fields),
  error: (event, fields) => write("error", event, fields),
  write
};
