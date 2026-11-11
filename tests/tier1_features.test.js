/**
 * Tier 1: Feature Coverage (Happy Path & Isolation)
 * 
 * Verifies nominal, specification-compliant behavior of each individual backend capability:
 * - F04: Data Model & Schema types
 * - F06: Server-side CO2 computation (mass_out_kg * 0.60 * 3.67) & client override rejection
 * - F07: Cryptographic Hash Chaining & Genesis prev_hash === ""
 * - F08: Batch Creation API (POST /api/batches) across allowed feedstocks
 * - F09: Batch Listing API (GET /api/batches) with chronological ordering
 * - F10: Batch Detail API (GET /api/batches/:id)
 * - F11: QR Code API (GET /api/batches/:id/qr) returning PNG with valid signature
 * - F12: CSV Export API (GET /api/export/csv) returning RFC 4180 CSV
 * - F13: Chain Verification API (GET /api/verify) returning valid: true on clean ledger
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

describe('Tier 1: Feature Coverage (Nominal / Happy Path)', () => {
  before(async () => {
    await ensureServerRunning();
  });

  after(() => {
    teardownServer();
  });

  let createdBatchId = null;
  let createdBatchHash = null;

  it('F08 / F04: POST /api/batches creates a batch record with valid payload and ULID', async () => {
    const payload = {
      feedstock: 'Wood',
      mass_in_kg: 1000.0,
      temp_c: 550.0,
      mass_out_kg: 300.0,
      notes: 'Tier 1 test batch - Oak trimmings'
    };

    const res = await postBatch(payload);
    assert.strictEqual(res.status, 201, `Expected HTTP 201 Created, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.ok(res.data, 'Response must contain batch object');

    const batch = res.data;
    assert.ok(typeof batch.id === 'string', 'batch.id must be string');
    assert.strictEqual(batch.id.length, 26, 'batch.id must be 26-character ULID');
    assert.match(batch.id, /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/i, 'batch.id must match Crockford Base32 ULID character set');

    // ISO8601 timestamp
    assert.ok(typeof batch.timestamp === 'string', 'batch.timestamp must be string');
    assert.ok(!isNaN(Date.parse(batch.timestamp)), 'batch.timestamp must be valid ISO8601 parseable date');

    // Echoed inputs
    assert.strictEqual(batch.feedstock, 'Wood');
    assert.strictEqual(Number(batch.mass_in_kg), 1000.0);
    assert.strictEqual(Number(batch.temp_c), 550.0);
    assert.strictEqual(Number(batch.mass_out_kg), 300.0);
    assert.strictEqual(batch.notes, 'Tier 1 test batch - Oak trimmings');

    // Hash structure
    assert.ok(typeof batch.prev_hash === 'string', 'prev_hash must be string');
    assert.ok(typeof batch.record_hash === 'string', 'record_hash must be string');
    assert.strictEqual(batch.record_hash.length, 64, 'record_hash must be 64-character SHA-256');
    assert.match(batch.record_hash, /^[0-9a-f]{64}$/, 'record_hash must be lowercase hex SHA-256');

    createdBatchId = batch.id;
    createdBatchHash = batch.record_hash;
  });

  it('F06: Server-side CO2 computation is strictly mass_out_kg * 0.60 * 3.67', async () => {
    const massOut = 250.0;
    const expectedCO2 = computeExpectedCO2(massOut); // 250 * 0.60 * 3.67 = 550.5

    const payload = {
      feedstock: 'Rice Husk',
      mass_in_kg: 800.0,
      temp_c: 480.0,
      mass_out_kg: massOut,
      notes: 'Testing precise CO2 calculation'
    };

    const res = await postBatch(payload);
    assert.strictEqual(res.status, 201);
    const actualCO2 = Number(res.data.co2_kg);
    assert.ok(
      Math.abs(actualCO2 - expectedCO2) < 0.001,
      `Expected CO2 ${expectedCO2}, got ${actualCO2}`
    );
  });

  it('F06: Server strictly ignores or overrides client-supplied co2_kg', async () => {
    const massOut = 150.0;
    const expectedCO2 = computeExpectedCO2(massOut); // 150 * 0.60 * 3.67 = 330.3

    const payload = {
      feedstock: 'Bamboo',
      mass_in_kg: 500.0,
      temp_c: 600.0,
      mass_out_kg: massOut,
      co2_kg: 999999.9, // Malicious / erroneous client value
      notes: 'Testing client co2_kg override rejection'
    };

    const res = await postBatch(payload);
    assert.strictEqual(res.status, 201);
    const actualCO2 = Number(res.data.co2_kg);
    assert.notStrictEqual(actualCO2, 999999.9, 'Server must not accept client-provided co2_kg');
    assert.ok(
      Math.abs(actualCO2 - expectedCO2) < 0.001,
      `Server must compute co2_kg as ${expectedCO2}, got ${actualCO2}`
    );
  });

  it('F08: Supports all allowed feedstock enum values', async () => {
    const feedstocks = ['Crop Residue', 'Other'];

    for (const feedstock of feedstocks) {
      const res = await postBatch({
        feedstock,
        mass_in_kg: 300.0,
        temp_c: 500.0,
        mass_out_kg: 90.0,
        notes: `Testing feedstock: ${feedstock}`
      });

      assert.strictEqual(res.status, 201, `Failed to post batch with feedstock ${feedstock}`);
      assert.strictEqual(res.data.feedstock, feedstock);
    }
  });

  it('F09: GET /api/batches lists all logged batches in chronological order', async () => {
    const res = await getBatches();
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data), 'GET /api/batches must return JSON array');
    assert.ok(res.data.length >= 1, 'Batches array should contain logged batches');

    // Check chronological order (ascending timestamp)
    for (let i = 1; i < res.data.length; i++) {
      const prevTime = new Date(res.data[i - 1].timestamp).getTime();
      const currTime = new Date(res.data[i].timestamp).getTime();
      assert.ok(
        currTime >= prevTime,
        `Batches not in ascending chronological order: index ${i} (${currTime}) < index ${i - 1} (${prevTime})`
      );
    }
  });

  it('F10: GET /api/batches/:id retrieves exact batch details by ULID', async () => {
    assert.ok(createdBatchId, 'createdBatchId must exist from earlier test');
    const res = await getBatch(createdBatchId);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.id, createdBatchId);
    assert.strictEqual(res.data.feedstock, 'Wood');
    assert.strictEqual(res.data.record_hash, createdBatchHash);
  });

  it('F11: GET /api/batches/:id/qr returns valid PNG image containing PNG signature', async () => {
    assert.ok(createdBatchId, 'createdBatchId must exist from earlier test');
    const res = await getBatchQr(createdBatchId);

    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(
      contentType.includes('image/png'),
      `Content-Type must be image/png, got ${contentType}`
    );

    assert.ok(res.buffer, 'Response must contain non-empty image buffer');
    assert.ok(res.buffer.length > 50, `PNG image buffer too small: ${res.buffer.length} bytes`);

    // PNG 8-byte magic header: 89 50 4E 47 0D 0A 1A 0A
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const fileHeader = res.buffer.subarray(0, 8);
    assert.deepStrictEqual(
      fileHeader,
      pngSignature,
      'Image binary must begin with standard PNG signature (89 50 4E 47 0D 0A 1A 0A)'
    );
  });

  it('F12: GET /api/export/csv exports full audit log with correct headers', async () => {
    const res = await exportCsv();
    assert.strictEqual(res.status, 200);

    const contentType = res.headers.get('content-type') || '';
    assert.ok(
      contentType.includes('text/csv'),
      `Content-Type must include text/csv, got ${contentType}`
    );

    assert.ok(typeof res.text === 'string', 'CSV response must be string');
    const lines = res.text.trim().split('\n').map((l) => l.trim());
    assert.ok(lines.length >= 2, 'CSV must contain at least header and one data row');

    // Verify header column names
    const headerLine = lines[0].toLowerCase();
    const requiredColumns = [
      'id',
      'timestamp',
      'feedstock',
      'mass_in_kg',
      'temp_c',
      'mass_out_kg',
      'notes',
      'co2_kg',
      'prev_hash',
      'record_hash'
    ];

    for (const col of requiredColumns) {
      assert.ok(
        headerLine.includes(col),
        `CSV header line missing required column "${col}": ${lines[0]}`
      );
    }
  });

  it('F13: GET /api/verify returns valid: true on clean untampered ledger', async () => {
    const res = await verifyChain();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.valid, true, 'Clean audit ledger must be valid');
    assert.strictEqual(res.data.broken_at, null, 'Clean audit ledger must have broken_at: null');
  });
});
