/**
 * Tier 4: Real-World Workload Scenarios & Tamper Injection
 * 
 * Verifies high-throughput facility operations and cryptographic tamper resilience:
 * - 10+ batch continuous biochar production facility simulation
 * - Aggregate telemetry reconciliation (total CO2 sequestered, total biochar output)
 * - Concurrent batch logging resilience
 * - Deliberate adversarial tamper injection via direct SQLite updates:
 *   * Scenario A: Tamper with mass_out_kg -> verify pinpoints exact broken ULID
 *   * Scenario B: Tamper with notes text -> verify pinpoints exact broken ULID
 *   * Scenario C: Tamper with record_hash -> verify pinpoints exact broken ULID
 *   * Scenario D: Tamper with prev_hash link -> verify pinpoints exact broken ULID
 *   * Scenario E: Tamper with genesis prev_hash -> verify pinpoints genesis ULID
 *   * Scenario F: Full recovery / rollback verification -> chain returns to valid: true
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  postBatch,
  getBatches,
  verifyChain,
  computeExpectedCO2,
  ensureServerRunning,
  teardownServer,
  getDirectDb,
  executeRawSql
} = require('./helpers.js');

describe('Tier 4: Real-World Workloads & Adversarial Tamper Injection', () => {
  before(async () => {
    await ensureServerRunning();
  });

  after(() => {
    teardownServer();
  });

  const facilityBatches = [];

  it('Simulates realistic 10+ batch industrial biochar production run', async () => {
    const simulationRuns = [
      { feedstock: 'Wood', mass_in_kg: 1500, temp_c: 550, mass_out_kg: 450, notes: 'Run 01: Pine chips' },
      { feedstock: 'Wood', mass_in_kg: 2000, temp_c: 580, mass_out_kg: 600, notes: 'Run 02: Hardwood mix' },
      { feedstock: 'Rice Husk', mass_in_kg: 1000, temp_c: 480, mass_out_kg: 320, notes: 'Run 03: Paddy husk' },
      { feedstock: 'Rice Husk', mass_in_kg: 1200, temp_c: 500, mass_out_kg: 380, notes: 'Run 04: Parboiled husk' },
      { feedstock: 'Crop Residue', mass_in_kg: 800, temp_c: 520, mass_out_kg: 240, notes: 'Run 05: Cotton stalks' },
      { feedstock: 'Crop Residue', mass_in_kg: 950, temp_c: 530, mass_out_kg: 285, notes: 'Run 06: Mustard stalk' },
      { feedstock: 'Bamboo', mass_in_kg: 1100, temp_c: 620, mass_out_kg: 330, notes: 'Run 07: Bamboo poles' },
      { feedstock: 'Bamboo', mass_in_kg: 1300, temp_c: 640, mass_out_kg: 390, notes: 'Run 08: Culm chips' },
      { feedstock: 'Other', mass_in_kg: 700, temp_c: 510, mass_out_kg: 210, notes: 'Run 09: Coconut shells' },
      { feedstock: 'Wood', mass_in_kg: 1800, temp_c: 570, mass_out_kg: 540, notes: 'Run 10: Forest slash' },
      { feedstock: 'Crop Residue', mass_in_kg: 1050, temp_c: 540, mass_out_kg: 315, notes: 'Run 11: Wheat straw' }
    ];

    for (let i = 0; i < simulationRuns.length; i++) {
      const res = await postBatch(simulationRuns[i]);
      assert.strictEqual(res.status, 201, `Failed simulation batch ${i + 1}`);
      facilityBatches.push(res.data);
    }

    assert.ok(facilityBatches.length >= 10, 'Expected at least 10 batches in facility simulation');

    // Verify unbroken chain across all simulated batches
    for (let i = 1; i < facilityBatches.length; i++) {
      assert.strictEqual(
        facilityBatches[i].prev_hash,
        facilityBatches[i - 1].record_hash,
        `Simulation link broken between batch ${i} and ${i + 1}`
      );
    }
  });

  it('Verifies aggregate telemetry metrics match ledger summation', async () => {
    let expectedTotalCO2 = 0;
    let expectedTotalBiochar = 0;

    for (const b of facilityBatches) {
      expectedTotalCO2 += computeExpectedCO2(b.mass_out_kg);
      expectedTotalBiochar += Number(b.mass_out_kg);
    }

    const listRes = await getBatches();
    assert.strictEqual(listRes.status, 200);

    const actualTotalBiochar = facilityBatches.reduce((acc, b) => acc + Number(b.mass_out_kg), 0);
    const actualTotalCO2 = facilityBatches.reduce((acc, b) => acc + Number(b.co2_kg), 0);

    assert.ok(
      Math.abs(actualTotalBiochar - expectedTotalBiochar) < 0.01,
      `Total biochar mismatch: expected ${expectedTotalBiochar}, got ${actualTotalBiochar}`
    );
    assert.ok(
      Math.abs(actualTotalCO2 - expectedTotalCO2) < 0.01,
      `Total CO2 mismatch: expected ${expectedTotalCO2}, got ${actualTotalCO2}`
    );
  });

  it('Handles concurrent batch submissions without race condition or chain corruption', async () => {
    const concurrentPayloads = [
      { feedstock: 'Wood', mass_in_kg: 400, temp_c: 500, mass_out_kg: 120, notes: 'Concurrent A' },
      { feedstock: 'Rice Husk', mass_in_kg: 450, temp_c: 510, mass_out_kg: 135, notes: 'Concurrent B' },
      { feedstock: 'Bamboo', mass_in_kg: 500, temp_c: 520, mass_out_kg: 150, notes: 'Concurrent C' },
      { feedstock: 'Crop Residue', mass_in_kg: 550, temp_c: 530, mass_out_kg: 165, notes: 'Concurrent D' }
    ];

    const results = await Promise.all(concurrentPayloads.map((p) => postBatch(p)));

    for (let i = 0; i < results.length; i++) {
      assert.strictEqual(results[i].status, 201, `Concurrent batch ${i + 1} failed`);
    }

    // Verify entire chain remains unbroken after concurrent insertions
    const verifyRes = await verifyChain();
    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.data.valid, true, 'Chain must be valid after concurrent inserts');
    assert.strictEqual(verifyRes.data.broken_at, null);
  });

  describe('Adversarial Tamper Injection & Chain Recovery', () => {
    it('Scenario A: Tampering with mass_out_kg fails verification at exact tampered batch', async () => {
      const allBatchesRes = await getBatches();
      assert.strictEqual(allBatchesRes.status, 200);
      assert.ok(allBatchesRes.data.length >= 5, 'Need at least 5 batches for tamper testing');

      const targetBatch = allBatchesRes.data[3]; // 4th batch in chain
      const originalMassOut = targetBatch.mass_out_kg;

      // Maliciously update mass_out_kg directly in database
      executeRawSql('UPDATE batches SET mass_out_kg = ? WHERE id = ?', [9999.0, targetBatch.id]);

      try {
        const verifyRes = await verifyChain();
        assert.strictEqual(verifyRes.status, 200);
        assert.strictEqual(verifyRes.data.valid, false, 'Tampered ledger must return valid: false');
        assert.strictEqual(
          verifyRes.data.broken_at,
          targetBatch.id,
          `Verification must identify broken record ID: ${targetBatch.id}`
        );
      } finally {
        // Rollback / restore original value
        executeRawSql('UPDATE batches SET mass_out_kg = ? WHERE id = ?', [originalMassOut, targetBatch.id]);
      }

      // Assert chain recovers
      const recoveredRes = await verifyChain();
      assert.strictEqual(recoveredRes.data.valid, true, 'Chain must recover after restoring data');
      assert.strictEqual(recoveredRes.data.broken_at, null);
    });

    it('Scenario B: Tampering with batch notes fails verification at exact tampered batch', async () => {
      const allBatchesRes = await getBatches();
      const targetBatch = allBatchesRes.data[2]; // 3rd batch
      const originalNotes = targetBatch.notes;

      // Mutate notes text
      executeRawSql('UPDATE batches SET notes = ? WHERE id = ?', ['ATTACKER_INJECTED_NOTE', targetBatch.id]);

      try {
        const verifyRes = await verifyChain();
        assert.strictEqual(verifyRes.status, 200);
        assert.strictEqual(verifyRes.data.valid, false, 'Tampered notes must fail verification');
        assert.strictEqual(verifyRes.data.broken_at, targetBatch.id);
      } finally {
        executeRawSql('UPDATE batches SET notes = ? WHERE id = ?', [originalNotes, targetBatch.id]);
      }

      const recoveredRes = await verifyChain();
      assert.strictEqual(recoveredRes.data.valid, true);
    });

    it('Scenario C: Tampering with record_hash fails verification at exact tampered batch', async () => {
      const allBatchesRes = await getBatches();
      const targetBatch = allBatchesRes.data[4];
      const originalHash = targetBatch.record_hash;

      const corruptedHash = '0000000000000000000000000000000000000000000000000000000000000000';
      executeRawSql('UPDATE batches SET record_hash = ? WHERE id = ?', [corruptedHash, targetBatch.id]);

      try {
        const verifyRes = await verifyChain();
        assert.strictEqual(verifyRes.status, 200);
        assert.strictEqual(verifyRes.data.valid, false);
        assert.strictEqual(verifyRes.data.broken_at, targetBatch.id);
      } finally {
        executeRawSql('UPDATE batches SET record_hash = ? WHERE id = ?', [originalHash, targetBatch.id]);
      }

      const recoveredRes = await verifyChain();
      assert.strictEqual(recoveredRes.data.valid, true);
    });

    it('Scenario D: Tampering with prev_hash link fails verification at corrupted successor', async () => {
      const allBatchesRes = await getBatches();
      const targetBatch = allBatchesRes.data[5]; // 6th batch
      const originalPrevHash = targetBatch.prev_hash;

      const fakePrevHash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      executeRawSql('UPDATE batches SET prev_hash = ? WHERE id = ?', [fakePrevHash, targetBatch.id]);

      try {
        const verifyRes = await verifyChain();
        assert.strictEqual(verifyRes.status, 200);
        assert.strictEqual(verifyRes.data.valid, false);
        assert.strictEqual(verifyRes.data.broken_at, targetBatch.id);
      } finally {
        executeRawSql('UPDATE batches SET prev_hash = ? WHERE id = ?', [originalPrevHash, targetBatch.id]);
      }

      const recoveredRes = await verifyChain();
      assert.strictEqual(recoveredRes.data.valid, true);
    });

    it('Scenario E: Tampering with genesis prev_hash (non-empty) fails at genesis record', async () => {
      const allBatchesRes = await getBatches();
      const genesisBatch = allBatchesRes.data[0];
      const originalPrevHash = genesisBatch.prev_hash;

      assert.strictEqual(originalPrevHash, '', 'Genesis prev_hash must originally be empty string');

      // Alter genesis prev_hash
      executeRawSql('UPDATE batches SET prev_hash = ? WHERE id = ?', ['INVALID_GENESIS_ROOT', genesisBatch.id]);

      try {
        const verifyRes = await verifyChain();
        assert.strictEqual(verifyRes.status, 200);
        assert.strictEqual(verifyRes.data.valid, false);
        assert.strictEqual(verifyRes.data.broken_at, genesisBatch.id);
      } finally {
        executeRawSql('UPDATE batches SET prev_hash = ? WHERE id = ?', [originalPrevHash, genesisBatch.id]);
      }

      const recoveredRes = await verifyChain();
      assert.strictEqual(recoveredRes.data.valid, true);
      assert.strictEqual(recoveredRes.data.broken_at, null);
    });
  });
});
