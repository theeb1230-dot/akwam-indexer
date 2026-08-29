const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const configuredPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : null;

const dataDir = configuredPath
  ? path.dirname(configuredPath)
  : path.join(process.cwd(), "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, {
    recursive: true
  });
}

const dbPath = configuredPath || path.join(
  dataDir,
  "theeb.sqlite"
);

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

module.exports = db;
