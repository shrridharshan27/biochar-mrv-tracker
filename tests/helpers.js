/**
 * Shared Test Helpers for Biochar MRV Tracker E2E Test Suite
 * 
 * Provides:
 * - Deterministic HTTP client abstraction (`request`, `postBatch`, etc.)
 * - Automatic server detection (connects to running instance or spawns ephemeral Express server)
 * - Reference mathematical models (CO2 formula, SHA-256 hash chaining)
 * - Direct SQLite access for Tier 4 tamper injection
 */

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

let serverInstance = null;
let activeBaseUrl = process.env.TEST_BASE_URL || process.env.BASE_URL || null;

/**
 * Checks whether an HTTP server is actively responding at the given URL
 */
async function isServerAlive(url) {
  try {
    const res = await fetch(`${url}/api/batches`, {
      method: 'GET',
      signal: AbortSignal.timeout(1500)
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return false;
    }
    const data = await res.json();
    return Array.isArray(data);
  } catch (err) {
    return false;
  }
}

/**
 * Resolves the base URL for tests, spawning an ephemeral server if needed
 */
async function ensureServerRunning() {
  if (activeBaseUrl) {
    return activeBaseUrl;
  }

  // 1. Check if server is already running on default port 3000
  const defaultUrl = 'http://localhost:3000';
  if (await isServerAlive(defaultUrl)) {
    activeBaseUrl = defaultUrl;
    return activeBaseUrl;
  }

  // 2. Check if server/src/app.js exists to spawn an ephemeral in-process server
  const appPath = path.resolve(__dirname, '../server/src/app.js');
  if (fs.existsSync(appPath)) {
    try {
      const appModule = require(appPath);
      const app = appModule.default || appModule.app || appModule;
      if (typeof app === 'function' || (app && typeof app.listen === 'function')) {
        await new Promise((resolve, reject) => {
          serverInstance = app.listen(0, '127.0.0.1', () => {
            const port = serverInstance.address().port;
            activeBaseUrl = `http://127.0.0.1:${port}`;
            resolve();
          });
          serverInstance.on('error', reject);
        });
        return activeBaseUrl;
      }
    } catch (e) {
      console.warn('Notice: Ephemeral app could not be launched directly:', e.message);
    }
  }

  // Fallback to defaultUrl (will produce connection error if not started)
  activeBaseUrl = defaultUrl;
  return activeBaseUrl;
}

/**
 * Tears down ephemeral server if spawned
 */
function teardownServer() {
  if (serverInstance && typeof serverInstance.close === 'function') {
    serverInstance.close();
    serverInstance = null;
    activeBaseUrl = null;
  }
}

/**
 * Generic HTTP Request Helper using native fetch
 */
async function request(method, endpoint, body = null, headers = {}) {
  const baseUrl = await ensureServerRunning();
  const url = `${baseUrl}${endpoint}`;

  const reqHeaders = { ...headers };
  let reqBody = undefined;

  if (body !== null && body !== undefined) {
    if (typeof body === 'object' && !(body instanceof Buffer)) {
      reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
      reqBody = JSON.stringify(body);
    } else {
      reqBody = body;
    }
  }

  const response = await fetch(url, {
    method,
    headers: reqHeaders,
    body: reqBody
  });

  const contentType = response.headers.get('content-type') || '';
  let data = null;
  let text = '';
  let buffer = null;

  if (contentType.includes('application/json')) {
    text = await response.text();
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }
  } else if (contentType.includes('image/') || contentType.includes('application/octet-stream')) {
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    text = buffer.toString('binary');
  } else {
    text = await response.text();
    data = text;
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    data,
    text,
    buffer
  };
}

// Convenience API wrappers
async function postBatch(payload) {
  return request('POST', '/api/batches', payload);
}

async function getBatches() {
  return request('GET', '/api/batches');
}

async function getBatch(id) {
  return request('GET', `/api/batches/${id}`);
}

async function getBatchQr(id) {
  return request('GET', `/api/batches/${id}/qr`);
}

async function exportCsv() {
  return request('GET', '/api/export/csv');
}

async function verifyChain() {
  return request('GET', '/api/verify');
}

/**
 * Authoritative CO2 formula calculation: mass_out_kg * 0.60 * 3.67
 */
function computeExpectedCO2(mass_out_kg) {
  return mass_out_kg * 0.60 * 3.67;
}

/**
 * Authoritative SHA-256 hash calculation over concatenated batch fields:
 * id + timestamp + feedstock + mass_in_kg + temp_c + mass_out_kg + notes + co2_kg + prev_hash
 */
function computeExpectedRecordHash(batch) {
  const notesStr = batch.notes !== null && batch.notes !== undefined ? String(batch.notes) : '';
  const payload = [
    String(batch.id),
    String(batch.timestamp),
    String(batch.feedstock),
    String(batch.mass_in_kg),
    String(batch.temp_c),
    String(batch.mass_out_kg),
    notesStr,
    String(batch.co2_kg),
    String(batch.prev_hash)
  ].join('');

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Connects directly to SQLite for Tier 4 tamper injection
 */
function getDirectDb() {
  // Check if server/src/db.js is available
  const dbModulePath = path.resolve(__dirname, '../server/src/db.js');
  if (fs.existsSync(dbModulePath)) {
    try {
      const dbModule = require(dbModulePath);
      const dbInstance = dbModule.db || dbModule.default || 
        (typeof dbModule.prepare === 'function' ? dbModule : null) || 
        (typeof dbModule.getDb === 'function' ? dbModule.getDb() : null);
      if (dbInstance && typeof dbInstance.prepare === 'function') {
        return dbInstance;
      }
    } catch (e) {
      // Fall through to file resolution
    }
  }

  // Look for sqlite database file
  const searchCandidates = [
    process.env.DB_PATH,
    path.resolve(__dirname, '../server/data/mrv_ledger.db'),
    path.resolve(__dirname, '../server/data/biochar.sqlite'),
    path.resolve(__dirname, '../server/data/biochar.db'),
    path.resolve(__dirname, '../server/biochar.sqlite'),
    path.resolve(__dirname, '../server/biochar.db'),
    path.resolve(__dirname, '../biochar.sqlite'),
    path.resolve(__dirname, '../biochar.db')
  ].filter(Boolean);

  for (const candidate of searchCandidates) {
    if (fs.existsSync(candidate)) {
      try {
        const BetterSqlite3 = require('../server/node_modules/better-sqlite3');
        return new BetterSqlite3(candidate);
      } catch (e) {
        try {
          const { DatabaseSync } = require('node:sqlite');
          return new DatabaseSync(candidate);
        } catch (e2) {
          // Ignore
        }
      }
    }
  }

  return null;
}

/**
 * Executes a raw SQL statement against the SQLite database (for tamper tests)
 */
function executeRawSql(sql, params = []) {
  const db = getDirectDb();
  if (!db) {
    throw new Error('Direct SQLite database connection could not be established. Ensure server DB file or server/src/db.js is accessible.');
  }

  if (typeof db.prepare === 'function') {
    const stmt = db.prepare(sql);
    if (typeof stmt.run === 'function') {
      return stmt.run(...params);
    }
    if (typeof stmt.all === 'function') {
      return stmt.all(...params);
    }
  }

  if (typeof db.exec === 'function') {
    return db.exec(sql);
  }

  throw new Error('Unsupported database interface.');
}

module.exports = {
  request,
  postBatch,
  getBatches,
  getBatch,
  getBatchQr,
  exportCsv,
  verifyChain,
  computeExpectedCO2,
  computeExpectedRecordHash,
  ensureServerRunning,
  teardownServer,
  getDirectDb,
  executeRawSql
};
