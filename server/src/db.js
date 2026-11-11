const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DEFAULT_DB_PATH = path.resolve(__dirname, '../data/mrv_ledger.db');

let defaultInstance = null;

/**
 * Initializes and configures an SQLite database with the batches table.
 * @param {string} [customPath] - Optional custom path for the database file or ':memory:'
 * @returns {Database.Database} The configured better-sqlite3 database instance
 */
function initDB(customPath) {
  const dbPath = customPath || process.env.DB_PATH || DEFAULT_DB_PATH;

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);

  // Enable WAL mode and data integrity pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  // Strict append-only table schema without triggers or update hooks
  db.exec(`
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      feedstock TEXT NOT NULL CHECK(feedstock IN ('Wood', 'Rice Husk', 'Crop Residue', 'Bamboo', 'Other')),
      mass_in_kg REAL NOT NULL CHECK(mass_in_kg > 0),
      temp_c REAL NOT NULL CHECK(temp_c > 0),
      mass_out_kg REAL NOT NULL CHECK(mass_out_kg > 0),
      notes TEXT DEFAULT '',
      co2_kg REAL NOT NULL,
      prev_hash TEXT NOT NULL,
      record_hash TEXT NOT NULL UNIQUE
    );

    CREATE INDEX IF NOT EXISTS idx_batches_timestamp ON batches(timestamp ASC);
  `);

  return db;
}

/**
 * Retrieves the singleton database instance, creating it if necessary.
 * If customPath is supplied, a new instance is created and returned.
 * @param {string} [customPath]
 * @returns {Database.Database}
 */
function getDB(customPath) {
  if (customPath) {
    return initDB(customPath);
  }
  if (!defaultInstance) {
    defaultInstance = initDB();
  }
  return defaultInstance;
}

/**
 * Closes the active database instance and resets the singleton.
 */
function closeDB() {
  if (defaultInstance) {
    try {
      defaultInstance.close();
    } catch (e) {
      // Ignore if already closed
    }
    defaultInstance = null;
  }
}

// Create a proxy so `require('./db')` can be used directly as a better-sqlite3 Database instance
const dbProxy = new Proxy({}, {
  get(target, prop) {
    if (prop === 'initDB') return initDB;
    if (prop === 'getDB') return getDB;
    if (prop === 'closeDB') return closeDB;
    if (prop === 'DEFAULT_DB_PATH') return DEFAULT_DB_PATH;

    const db = getDB();
    if (typeof db[prop] === 'function') {
      return db[prop].bind(db);
    }
    return db[prop];
  }
});

module.exports = dbProxy;
module.exports.initDB = initDB;
module.exports.getDB = getDB;
module.exports.closeDB = closeDB;
module.exports.DEFAULT_DB_PATH = DEFAULT_DB_PATH;
