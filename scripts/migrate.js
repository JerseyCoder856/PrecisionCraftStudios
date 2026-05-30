const fs = require('fs');
const path = require('path');
const { getDb, closeDb } = require('../src/server/db');

const db = getDb();
db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
const applied = new Set(db.prepare('SELECT filename FROM schema_migrations').all().map(row => row.filename));
const migrationsDir = path.resolve(__dirname, '..', 'migrations');
const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort();

for (const file of files) {
  if (applied.has(file)) continue;
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  db.exec('BEGIN');
  try {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
    db.exec('COMMIT');
    console.log(`Applied migration ${file}`);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

console.log('Database migrations complete.');
closeDb();
