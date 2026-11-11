const crypto = require('crypto');
const { ulid } = require('ulid');
const { getDB } = require('./db');

/**
 * Computes net atmospheric CO2 sequestered from biochar yield in kg.
 * Formula: mass_out_kg * 0.60 * 3.67
 * - 0.60: 60% stable elemental carbon fraction in biochar
 * - 3.67: Molecular weight ratio of CO2 (44) to C (12)
 * Client-supplied co2_kg is NEVER accepted.
 * @param {number} mass_out_kg
 * @returns {number}
 */
function computeCO2(mass_out_kg) {
  const massOut = Number(mass_out_kg);
  return massOut * 0.60 * 3.67;
}

/**
 * Computes SHA-256 cryptographic digest over concatenated batch fields.
 * Exact concatenation:
 * id + timestamp + feedstock + mass_in_kg + temp_c + mass_out_kg + (notes ?? '') + co2_kg + prev_hash
 * @param {object} record
 * @returns {string} 64-character lowercase hex digest
 */
function computeRecordHash(record) {
  const notesStr = (record.notes !== null && record.notes !== undefined) ? String(record.notes) : '';
  const payload = [
    String(record.id),
    String(record.timestamp),
    String(record.feedstock),
    String(record.mass_in_kg),
    String(record.temp_c),
    String(record.mass_out_kg),
    notesStr,
    String(record.co2_kg),
    String(record.prev_hash)
  ].join('');

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Atomically inserts a new batch into the append-only ledger.
 * Resolves the preceding hash, computes the record hash, and inserts the row.
 * @param {import('better-sqlite3').Database} [targetDb]
 * @param {object} batchData
 * @returns {object} The persisted batch record
 */
function insertBatchRecord(targetDb, batchData) {
  let db = targetDb;
  let data = batchData;

  // Handle case where db is omitted and data is passed as first argument
  if (data === undefined && targetDb && !targetDb.prepare) {
    data = targetDb;
    db = getDB();
  } else if (!db) {
    db = getDB();
  }

  const runInsertTransaction = db.transaction((item) => {
    // 1. Query the immediately preceding record hash
    // Ordering by rowid DESC guarantees insertion sequence
    const prevRecord = db.prepare('SELECT record_hash FROM batches ORDER BY rowid DESC LIMIT 1').get();
    const prev_hash = prevRecord ? prevRecord.record_hash : '';

    // 2. Generate immutable attributes
    const id = ulid();
    const timestamp = new Date().toISOString();
    const mass_in_kg = Number(item.mass_in_kg);
    const temp_c = Number(item.temp_c);
    const mass_out_kg = Number(item.mass_out_kg);
    const co2_kg = computeCO2(mass_out_kg);
    const notes = (item.notes !== null && item.notes !== undefined) ? String(item.notes) : '';

    // 3. Compute deterministic cryptographic hash
    const record_hash = computeRecordHash({
      id,
      timestamp,
      feedstock: item.feedstock,
      mass_in_kg,
      temp_c,
      mass_out_kg,
      notes,
      co2_kg,
      prev_hash
    });

    // 4. Insert record into database
    const stmt = db.prepare(`
      INSERT INTO batches (id, timestamp, feedstock, mass_in_kg, temp_c, mass_out_kg, notes, co2_kg, prev_hash, record_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, timestamp, item.feedstock, mass_in_kg, temp_c, mass_out_kg, notes, co2_kg, prev_hash, record_hash);

    return {
      id,
      timestamp,
      feedstock: item.feedstock,
      mass_in_kg,
      temp_c,
      mass_out_kg,
      notes,
      co2_kg,
      prev_hash,
      record_hash
    };
  });

  return runInsertTransaction(data);
}

/**
 * Retrieves all batches ordered chronologically by timestamp ascending.
 * @param {import('better-sqlite3').Database} [targetDb]
 * @returns {Array<object>}
 */
function getAllBatches(targetDb) {
  const db = (targetDb && targetDb.prepare) ? targetDb : getDB();
  return db.prepare('SELECT * FROM batches ORDER BY timestamp ASC, rowid ASC').all();
}

/**
 * Retrieves a single batch by ULID.
 * @param {import('better-sqlite3').Database} [targetDb]
 * @param {string} id
 * @returns {object|null}
 */
function getBatchById(targetDb, id) {
  let db = targetDb;
  let batchId = id;

  if (batchId === undefined && typeof targetDb === 'string') {
    batchId = targetDb;
    db = getDB();
  } else if (!db || !db.prepare) {
    db = getDB();
  }

  const record = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId);
  return record || null;
}

/**
 * Verifies the integrity of the entire cryptographic chain.
 * Traverses all records ordered by timestamp ASC.
 * - Genesis record must have prev_hash === "".
 * - Record i > 0 must have prev_hash === record[i - 1].record_hash.
 * - Every record's record_hash must match SHA-256 over its concatenated attributes.
 * Returns { valid: true, broken_at: null } if intact.
 * Returns { valid: false, broken_at: record.id } upon first failure.
 * @param {import('better-sqlite3').Database} [targetDb]
 * @returns {{ valid: boolean, broken_at: string|null }}
 */
function verifyChain(targetDb) {
  const db = (targetDb && targetDb.prepare) ? targetDb : getDB();
  const rows = db.prepare('SELECT * FROM batches ORDER BY timestamp ASC, rowid ASC').all();

  if (rows.length === 0) {
    return { valid: true, broken_at: null };
  }

  for (let i = 0; i < rows.length; i++) {
    const current = rows[i];

    // Check link pointer to previous record
    if (i === 0) {
      if (current.prev_hash !== '') {
        return { valid: false, broken_at: current.id };
      }
    } else {
      const predecessor = rows[i - 1];
      if (current.prev_hash !== predecessor.record_hash) {
        return { valid: false, broken_at: current.id };
      }
    }

    // Check cryptographic content integrity
    const expectedHash = computeRecordHash(current);
    if (current.record_hash !== expectedHash) {
      return { valid: false, broken_at: current.id };
    }
  }

  return { valid: true, broken_at: null };
}

module.exports = {
  computeCO2,
  computeRecordHash,
  insertBatchRecord,
  getAllBatches,
  getBatchById,
  verifyChain
};
