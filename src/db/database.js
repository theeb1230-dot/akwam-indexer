const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(process.cwd(), "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, {
    recursive: true
  });
}

const dbPath = path.join(
  dataDir,
  "theeb.sqlite"
);

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

module.exports = db;
