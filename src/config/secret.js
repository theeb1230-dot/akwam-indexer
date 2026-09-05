const fs = require("node:fs");

function secretError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function secretValue(env, name, options = {}) {
  const directName = String(name);
  const fileName = options.fileName || directName + "_FILE";
  const maximumBytes = Number(options.maximumBytes || 4096);
  const direct = String(env?.[directName] || "");
  const file = String(env?.[fileName] || "").trim();

  if (direct && file) {
    throw secretError(directName + "_SOURCE_AMBIGUOUS");
  }

  if (!file) return direct;

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw secretError("INVALID_" + fileName);
  }

  if (!stat.isFile() || stat.size <= 0 || stat.size > maximumBytes) {
    throw secretError("INVALID_" + fileName);
  }

  let value;
  try {
    value = fs.readFileSync(file, "utf8").trim();
  } catch {
    throw secretError("INVALID_" + fileName);
  }

  if (!value || Buffer.byteLength(value) > maximumBytes) {
    throw secretError("INVALID_" + fileName);
  }
  return value;
}

module.exports = { secretValue };
