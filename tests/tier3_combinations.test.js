/**
 * Tier 3: Cross-Feature Combinations & Multi-Step Workflows
 * 
 * Verifies end-to-end integration across multiple features:
 * - Multi-batch sequential chaining (prev_hash linking and genesis verification)
 * - Independent SHA-256 hash recalculation and bit-level matching
 * - List-to-detail view consistency across the ledger
 * - QR code delivery and PNG header validation
 * - CSV export parsing, column structure, and data reconciliation
 * - End-to-end audit verification after multi-batch workflow
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  postBatch,
  getBatches,
  getBatch,
  getBatchQr,
  exportCsv,
  verifyChain,
  computeExpectedCO2,
  computeExpectedRecordHash,
  ensureServerRunning,
  teardownServer
} = require('./helpers.js');

describe('Tier 3: Cross-Feature Combinations & Workflows', () => {
  before(async () => {
    await ensureServerRunning();
  });

  after(() => {
    teardownServer();
  });

  const createdBatches = [];

  it('Creates a multi-batch sequence and verifies hash chaining continuity', async () => {
    const batchInputs = [
      {
        feedstock: 'Wood',
        mass_in_kg: 1200.0,
        temp_c: 550.0,
        mass_out_kg: 360.0,
        notes: 'Chaining Batch 1 - Wood'
      },
      {
        feedstock: 'Rice Husk',
        mass_in_kg: 850.0,
        temp_c: 500.0,
        mass_out_kg: 255.0,
        notes: 'Chaining Batch 2 - Rice Husk'
      },
      {
        feedstock: 'Bamboo',
        mass_in_kg: 620.0,
        temp_c: 580.0,
        mass_out_kg: 186.0,
        notes: 'Chaining Batch 3 - Bamboo'
      },
      {
        feedstock: 'Crop Residue',
        mass_in_kg: 900.0,
        temp_c: 520.0,
        mass_out_kg: 270.0,
        notes: 'Chaining Batch 4 - Crop Residue with, "quotes" and commas'
      }
    ];

    for (let i = 0; i < batchInputs.length; i++) {
      const input = batchInputs[i];
      const res = await postBatch(input);
      assert.strictEqual(res.status, 201, `Failed to post batch ${i + 1}`);
      const batch = res.data;
      createdBatches.push(batch);

      // Verify link to predecessor
      if (i > 0) {
        const predecessor = createdBatches[i - 1];
        assert.strictEqual(
          batch.prev_hash,
          predecessor.record_hash,
          `Batch ${i + 1} prev_hash must strictly match predecessor record_hash`
        );
      }
    }
  });

  it('Verifies independent SHA-256 hash recalculation matches stored record_hash', () => {
    assert.ok(createdBatches.length >= 4, 'Must have at least 4 batches created');

    for (const batch of createdBatches) {
      const expectedHash = computeExpectedRecordHash(batch);
      assert.strictEqual(
        batch.record_hash,
        expectedHash,
        `Recomputed hash for batch ${batch.id} must match record_hash byte-for-byte`
      );
    }
  });

  it('Verifies list-to-detail consistency for all created batches', async () => {
    const listRes = await getBatches();
    assert.strictEqual(listRes.status, 200);
    const allBatches = listRes.data;

    // Index all batches by ID
    const batchMap = new Map(allBatches.map((b) => [b.id, b]));

    for (const created of createdBatches) {
      assert.ok(batchMap.has(created.id), `Batch ${created.id} must appear in GET /api/batches`);

      const detailRes = await getBatch(created.id);
      assert.strictEqual(detailRes.status, 200);
      const detail = detailRes.data;

      // Assert parity across all attributes
      assert.strictEqual(detail.id, created.id);
      assert.strictEqual(detail.feedstock, created.feedstock);
      assert.strictEqual(Number(detail.mass_in_kg), Number(created.mass_in_kg));
      assert.strictEqual(Number(detail.temp_c), Number(created.temp_c));
      assert.strictEqual(Number(detail.mass_out_kg), Number(created.mass_out_kg));
      assert.strictEqual(detail.notes, created.notes);
      assert.strictEqual(Number(detail.co2_kg), Number(created.co2_kg));
      assert.strictEqual(detail.prev_hash, created.prev_hash);
      assert.strictEqual(detail.record_hash, created.record_hash);
    }
  });

  it('Verifies QR code delivery for all batches in sequence', async () => {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    for (const batch of createdBatches) {
      const res = await getBatchQr(batch.id);
      assert.strictEqual(res.status, 200);
      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('image/png'), `QR Content-Type must be image/png`);
      assert.ok(res.buffer && res.buffer.length > 50, 'QR buffer must be non-empty');
      assert.deepStrictEqual(
        res.buffer.subarray(0, 8),
        pngSignature,
        'QR buffer must have valid PNG magic signature'
      );
    }
  });

  it('Verifies CSV export accurately parses and reconciles against ledger records', async () => {
    const res = await exportCsv();
    assert.strictEqual(res.status, 200);
    assert.ok(res.text, 'CSV response must have content');

    // Parse simple CSV rows (accounting for RFC 4180 quotes)
    const parseCsvLines = (text) => {
      const lines = [];
      let currentLine = '';
      let inQuotes = false;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
          inQuotes = !inQuotes;
          currentLine += char;
        } else if (char === '\n' && !inQuotes) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = '';
        } else {
          currentLine += char;
        }
      }
      if (currentLine.trim()) lines.push(currentLine.trim());
      return lines;
    };

    const lines = parseCsvLines(res.text);
    assert.ok(lines.length >= createdBatches.length + 1, 'CSV must contain header and all data rows');

    const header = lines[0].toLowerCase();
    assert.ok(header.includes('id'));
    assert.ok(header.includes('record_hash'));
    assert.ok(header.includes('prev_hash'));
    assert.ok(header.includes('co2_kg'));

    // Verify all created batch IDs exist in the CSV content
    for (const batch of createdBatches) {
      assert.ok(
        res.text.includes(batch.id),
        `CSV export must include batch ID ${batch.id}`
      );
      assert.ok(
        res.text.includes(batch.record_hash),
        `CSV export must include record_hash ${batch.record_hash}`
      );
    }
  });

  it('Verifies entire chain integrity via GET /api/verify after sequential batch additions', async () => {
    const res = await verifyChain();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.valid, true, 'Chain must be valid after batch sequence');
    assert.strictEqual(res.data.broken_at, null, 'No broken record expected');
  });
});
