const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { getConfig } = require('./config');

let db;

function getDb() {
  if (db) return db;
  const config = getConfig();
  const dbPath = path.resolve(process.cwd(), config.databasePath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function closeDb() {
  if (db) db.close();
  db = null;
}

module.exports = { getDb, closeDb };
