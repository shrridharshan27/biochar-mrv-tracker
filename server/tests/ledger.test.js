const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { initDB } = require('../src/db');
const {
  computeCO2,
  computeRecordHash,
  insertBatchRecord,
  getAllBatches,
  getBatchById,
  verifyChain
} = require('../src/ledger');

describe('Cryptographic Ledger Unit Tests', () => {
  let db;

  beforeEach(() => {
    // Isolated in-memory database for each test
    db = initDB(':memory:');
  });

  describe('CO2 Calculation (computeCO2)', () => {
    it('calculates mass_out_kg * 0.60 * 3.67 accurately', () => {
      // 100 kg biochar * 0.60 * 3.67 = 220.2 kg CO2
      const co2 = computeCO2(100);
      assert.equal(co2, 220.2);
    });

    it('calculates for different yields', () => {
      const co2_300 = computeCO2(300);
      assert.equal(co2_300, 300 * 0.60 * 3.67);

      const co2_50 = computeCO2(50);
      assert.equal(co2_50, 50 * 0.60 * 3.67);
    });
  });

  describe('Hash Computation (computeRecordHash)', () => {
    it('produces exact SHA-256 over concatenated fields', () => {
      const record = {
        id: '01TESTULID0000000000000001',
        timestamp: '2026-11-11T12:00:00.000Z',
        feedstock: 'Wood',
        mass_in_kg: 1000,
        temp_c: 550,
        mass_out_kg: 300,
        notes: 'Dry oak',
        co2_kg: 660.6,
        prev_hash: '0000000000000000000000000000000000000000000000000000000000000000'
      };

      const calculated = computeRecordHash(record);

      const expectedPayload = 
        '01TESTULID0000000000000001' +
        '2026-11-11T12:00:00.000Z' +
        'Wood' +
        '1000' +
        '550' +
        '300' +
        'Dry oak' +
        '660.6' +
        '0000000000000000000000000000000000000000000000000000000000000000';

      const expectedHash = crypto.createHash('sha256').update(expectedPayload, 'utf8').digest('hex');
      assert.equal(calculated, expectedHash);
      assert.equal(calculated.length, 64);
    });

    it('handles null, undefined, or empty notes consistently as empty string', () => {
      const baseRecord = {
        id: '01TESTULID0000000000000002',
        timestamp: '2026-11-11T12:00:00.000Z',
        feedstock: 'Bamboo',
        mass_in_kg: 500,
        temp_c: 600,
        mass_out_kg: 150,
        co2_kg: 330.3,
        prev_hash: ''
      };

      const hashEmpty = computeRecordHash({ ...baseRecord, notes: '' });
      const hashNull = computeRecordHash({ ...baseRecord, notes: null });
      const hashUndefined = computeRecordHash({ ...baseRecord, notes: undefined });

      assert.equal(hashNull, hashEmpty);
      assert.equal(hashUndefined, hashEmpty);
    });
  });

  describe('Append-Only Hash Chaining & Genesis Logic', () => {
    it('sets prev_hash to empty string "" for the genesis record', () => {
      const batch1 = insertBatchRecord(db, {
        feedstock: 'Wood',
        mass_in_kg: 1000,
        temp_c: 550,
        mass_out_kg: 300,
        notes: 'Genesis batch'
      });

      assert.ok(batch1.id);
      assert.equal(batch1.id.length, 26);
      assert.equal(batch1.prev_hash, '');
      assert.ok(batch1.record_hash);
      assert.equal(batch1.record_hash.length, 64);

      // Verify hash recomputation
      const expectedHash = computeRecordHash(batch1);
      assert.equal(batch1.record_hash, expectedHash);
    });

    it('chains subsequent records to immediate predecessor record_hash', () => {
      const batch1 = insertBatchRecord(db, {
        feedstock: 'Wood',
        mass_in_kg: 1000,
        temp_c: 500,
        mass_out_kg: 300
      });

      const batch2 = insertBatchRecord(db, {
        feedstock: 'Rice Husk',
        mass_in_kg: 800,
        temp_c: 480,
        mass_out_kg: 240
      });

      const batch3 = insertBatchRecord(db, {
        feedstock: 'Crop Residue',
        mass_in_kg: 600,
        temp_c: 520,
        mass_out_kg: 180
      });

      assert.equal(batch1.prev_hash, '');
      assert.equal(batch2.prev_hash, batch1.record_hash);
      assert.equal(batch3.prev_hash, batch2.record_hash);

      const all = getAllBatches(db);
      assert.equal(all.length, 3);
      assert.equal(all[0].id, batch1.id);
      assert.equal(all[1].id, batch2.id);
      assert.equal(all[2].id, batch3.id);
    });
  });

  describe('Chain Verification & Tamper Detection', () => {
    it('returns valid: true for an empty ledger', () => {
      const result = verifyChain(db);
      assert.deepEqual(result, { valid: true, broken_at: null });
    });

    it('returns valid: true for untampered multi-batch chain', () => {
      insertBatchRecord(db, { feedstock: 'Wood', mass_in_kg: 1000, temp_c: 500, mass_out_kg: 300 });
      insertBatchRecord(db, { feedstock: 'Rice Husk', mass_in_kg: 800, temp_c: 480, mass_out_kg: 240 });
      insertBatchRecord(db, { feedstock: 'Bamboo', mass_in_kg: 600, temp_c: 520, mass_out_kg: 180 });

      const result = verifyChain(db);
      assert.deepEqual(result, { valid: true, broken_at: null });
    });

    it('detects tampering when mass_out_kg is altered via raw SQL', () => {
      const b1 = insertBatchRecord(db, { feedstock: 'Wood', mass_in_kg: 1000, temp_c: 500, mass_out_kg: 300 });
      const b2 = insertBatchRecord(db, { feedstock: 'Rice Husk', mass_in_kg: 800, temp_c: 480, mass_out_kg: 240 });
      const b3 = insertBatchRecord(db, { feedstock: 'Bamboo', mass_in_kg: 600, temp_c: 520, mass_out_kg: 180 });

      // Maliciously alter b2 mass_out_kg
      db.prepare('UPDATE batches SET mass_out_kg = 999 WHERE id = ?').run(b2.id);

      const result = verifyChain(db);
      assert.equal(result.valid, false);
      assert.equal(result.broken_at, b2.id);
    });

    it('detects tampering when record_hash is altered directly', () => {
      const b1 = insertBatchRecord(db, { feedstock: 'Wood', mass_in_kg: 1000, temp_c: 500, mass_out_kg: 300 });
      const b2 = insertBatchRecord(db, { feedstock: 'Rice Husk', mass_in_kg: 800, temp_c: 480, mass_out_kg: 240 });

      // Tamper b1's record_hash
      db.prepare("UPDATE batches SET record_hash = '1111111111111111111111111111111111111111111111111111111111111111' WHERE id = ?").run(b1.id);

      const result = verifyChain(db);
      assert.equal(result.valid, false);
      assert.equal(result.broken_at, b1.id);
    });

    it('detects tampering when prev_hash of successor is broken', () => {
      const b1 = insertBatchRecord(db, { feedstock: 'Wood', mass_in_kg: 1000, temp_c: 500, mass_out_kg: 300 });
      const b2 = insertBatchRecord(db, { feedstock: 'Rice Husk', mass_in_kg: 800, temp_c: 480, mass_out_kg: 240 });

      // Tamper b2's prev_hash pointer directly
      db.prepare("UPDATE batches SET prev_hash = '0000000000000000000000000000000000000000000000000000000000000000' WHERE id = ?").run(b2.id);

      const result = verifyChain(db);
      assert.equal(result.valid, false);
      assert.equal(result.broken_at, b2.id);
    });

    it('detects tampering when an attacker updates data and recomputes that record hash, breaking the next record link', () => {
      const b1 = insertBatchRecord(db, { feedstock: 'Wood', mass_in_kg: 1000, temp_c: 500, mass_out_kg: 300 });
      const b2 = insertBatchRecord(db, { feedstock: 'Rice Husk', mass_in_kg: 800, temp_c: 480, mass_out_kg: 240 });
      const b3 = insertBatchRecord(db, { feedstock: 'Bamboo', mass_in_kg: 600, temp_c: 520, mass_out_kg: 180 });

      // Attacker changes b2 mass_out_kg AND recomputes b2's record_hash so b2 looks internally valid
      const newMassOut = 250;
      const newCo2 = computeCO2(newMassOut);
      const recomputedHash = computeRecordHash({
        id: b2.id,
        timestamp: b2.timestamp,
        feedstock: b2.feedstock,
        mass_in_kg: b2.mass_in_kg,
        temp_c: b2.temp_c,
        mass_out_kg: newMassOut,
        notes: b2.notes,
        co2_kg: newCo2,
        prev_hash: b2.prev_hash
      });

      db.prepare(`
        UPDATE batches
        SET mass_out_kg = ?, co2_kg = ?, record_hash = ?
        WHERE id = ?
      `).run(newMassOut, newCo2, recomputedHash, b2.id);

      // Now b2 hash matches b2 fields, but b3.prev_hash still points to b2's OLD hash!
      const result = verifyChain(db);
      assert.equal(result.valid, false);
      assert.equal(result.broken_at, b3.id);
    });

    it('detects tampering if genesis prev_hash is modified from "" to anything', () => {
      const b1 = insertBatchRecord(db, { feedstock: 'Wood', mass_in_kg: 1000, temp_c: 500, mass_out_kg: 300 });

      db.prepare("UPDATE batches SET prev_hash = 'nonempty' WHERE id = ?").run(b1.id);

      const result = verifyChain(db);
      assert.equal(result.valid, false);
      assert.equal(result.broken_at, b1.id);
    });
  });
});
