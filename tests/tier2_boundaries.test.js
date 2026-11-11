/**
 * Tier 2: Boundary & Corner Cases
 * 
 * Verifies rejection semantics, input sanitization, mass balance constraints,
 * and defensive HTTP method restrictions:
 * - Invalid feedstock strings, enums, casing, and non-string types
 * - Zero and negative values for mass_in_kg, temp_c, mass_out_kg
 * - Mass balance violations (mass_out_kg > mass_in_kg)
 * - Missing required fields and invalid types
 * - Notes boundary conditions (null, omitted, special characters, commas, quotes)
 * - Client injection of id, timestamp, prev_hash, record_hash
 * - 404 Not Found for non-existent ULIDs on details and QR endpoints
 * - 405 Method Not Allowed (or 404) on PUT, PATCH, DELETE (strict append-only)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  request,
  postBatch,
  getBatch,
  getBatchQr,
  ensureServerRunning,
  teardownServer
} = require('./helpers.js');

describe('Tier 2: Boundary & Corner Cases', () => {
  before(async () => {
    await ensureServerRunning();
  });

  after(() => {
    teardownServer();
  });

  describe('Feedstock Enumeration Validation', () => {
    it('Rejects non-enumerated feedstock strings (e.g., "Plastic", "Coal")', async () => {
      const invalidFeedstocks = ['Plastic', 'Coal', 'Synthetic', 'Tires', 'Rubber'];

      for (const feedstock of invalidFeedstocks) {
        const res = await postBatch({
          feedstock,
          mass_in_kg: 500,
          temp_c: 500,
          mass_out_kg: 150
        });
        assert.strictEqual(
          res.status,
          400,
          `Expected 400 Bad Request for feedstock "${feedstock}", got ${res.status}`
        );
      }
    });

    it('Enforces exact casing (rejects lowercase "wood", "rice husk")', async () => {
      const lowercaseFeedstocks = ['wood', 'rice husk', 'crop residue', 'bamboo', 'other'];

      for (const feedstock of lowercaseFeedstocks) {
        const res = await postBatch({
          feedstock,
          mass_in_kg: 500,
          temp_c: 500,
          mass_out_kg: 150
        });
        assert.strictEqual(
          res.status,
          400,
          `Expected 400 Bad Request for lowercase feedstock "${feedstock}", got ${res.status}`
        );
      }
    });

    it('Rejects empty or non-string feedstock values', async () => {
      const badFeedstocks = ['', '   ', null, 12345, true, [], {}];

      for (const feedstock of badFeedstocks) {
        const res = await postBatch({
          feedstock,
          mass_in_kg: 500,
          temp_c: 500,
          mass_out_kg: 150
        });
        assert.strictEqual(
          res.status,
          400,
          `Expected 400 Bad Request for feedstock ${JSON.stringify(feedstock)}, got ${res.status}`
        );
      }
    });
  });

  describe('Mass & Temperature Numeric Boundaries', () => {
    it('Rejects mass_in_kg <= 0', async () => {
      for (const val of [0, -0.01, -500]) {
        const res = await postBatch({
          feedstock: 'Wood',
          mass_in_kg: val,
          temp_c: 500,
          mass_out_kg: 100
        });
        assert.strictEqual(res.status, 400, `Expected 400 for mass_in_kg: ${val}, got ${res.status}`);
      }
    });

    it('Rejects temp_c <= 0', async () => {
      for (const val of [0, -1, -300]) {
        const res = await postBatch({
          feedstock: 'Wood',
          mass_in_kg: 500,
          temp_c: val,
          mass_out_kg: 100
        });
        assert.strictEqual(res.status, 400, `Expected 400 for temp_c: ${val}, got ${res.status}`);
      }
    });

    it('Rejects mass_out_kg <= 0', async () => {
      for (const val of [0, -0.01, -150]) {
        const res = await postBatch({
          feedstock: 'Wood',
          mass_in_kg: 500,
          temp_c: 500,
          mass_out_kg: val
        });
        assert.strictEqual(res.status, 400, `Expected 400 for mass_out_kg: ${val}, got ${res.status}`);
      }
    });

    it('Rejects mass_out_kg > mass_in_kg (pyrolysis mass balance violation)', async () => {
      const res = await postBatch({
        feedstock: 'Wood',
        mass_in_kg: 100.0,
        temp_c: 550.0,
        mass_out_kg: 250.0 // Output cannot exceed input
      });
      assert.strictEqual(
        res.status,
        400,
        `Expected 400 for mass_out_kg > mass_in_kg, got ${res.status}: ${JSON.stringify(res.data)}`
      );
    });

    it('Rejects non-numeric string values for mass and temperature', async () => {
      const badPayloads = [
        { feedstock: 'Wood', mass_in_kg: 'one-thousand', temp_c: 500, mass_out_kg: 200 },
        { feedstock: 'Wood', mass_in_kg: 500, temp_c: 'five-hundred', mass_out_kg: 200 },
        { feedstock: 'Wood', mass_in_kg: 500, temp_c: 500, mass_out_kg: 'two-hundred' }
      ];

      for (const payload of badPayloads) {
        const res = await postBatch(payload);
        assert.strictEqual(res.status, 400, `Expected 400 for non-numeric field, got ${res.status}`);
      }
    });
  });

  describe('Missing Fields & Nullability', () => {
    it('Rejects payload with missing required fields', async () => {
      const requiredFields = ['feedstock', 'mass_in_kg', 'temp_c', 'mass_out_kg'];
      const basePayload = {
        feedstock: 'Rice Husk',
        mass_in_kg: 500,
        temp_c: 520,
        mass_out_kg: 150
      };

      for (const field of requiredFields) {
        const partial = { ...basePayload };
        delete partial[field];
        const res = await postBatch(partial);
        assert.strictEqual(
          res.status,
          400,
          `Expected 400 for missing field "${field}", got ${res.status}`
        );
      }

      // Empty payload
      const emptyRes = await postBatch({});
      assert.strictEqual(emptyRes.status, 400, 'Expected 400 for completely empty payload');
    });

    it('Accepts omitted notes, normalizing to empty string', async () => {
      const res = await postBatch({
        feedstock: 'Bamboo',
        mass_in_kg: 400,
        temp_c: 550,
        mass_out_kg: 120
        // notes omitted
      });

      assert.strictEqual(res.status, 201);
      assert.ok(res.data.notes === '' || res.data.notes === null || res.data.notes === undefined);
    });

    it('Handles special characters, commas, quotes, and newlines in notes cleanly', async () => {
      const complexNotes = 'Kiln #3: 15% moisture, "high density", \nNew batch with symbols & <XML> #tag 🌲';
      const res = await postBatch({
        feedstock: 'Wood',
        mass_in_kg: 500,
        temp_c: 550,
        mass_out_kg: 150,
        notes: complexNotes
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.notes, complexNotes);
    });
  });

  describe('Client Injection Resistance', () => {
    it('Discards client-provided id and generates authentic server ULID', async () => {
      const clientProvidedId = 'CUSTOM_CLIENT_INJECTED_ID';
      const res = await postBatch({
        id: clientProvidedId,
        feedstock: 'Wood',
        mass_in_kg: 600,
        temp_c: 500,
        mass_out_kg: 180
      });

      assert.strictEqual(res.status, 201);
      assert.notStrictEqual(res.data.id, clientProvidedId, 'Server must not accept client-provided id');
      assert.strictEqual(res.data.id.length, 26, 'Server must generate genuine 26-char ULID');
    });

    it('Discards client-provided prev_hash and queries true predecessor hash', async () => {
      const fakePrevHash = '0000000000000000000000000000000000000000000000000000000000000000';
      const res = await postBatch({
        prev_hash: fakePrevHash,
        feedstock: 'Crop Residue',
        mass_in_kg: 600,
        temp_c: 500,
        mass_out_kg: 180
      });

      assert.strictEqual(res.status, 201);
      assert.notStrictEqual(res.data.prev_hash, fakePrevHash, 'Server must not accept fake prev_hash');
    });

    it('Discards client-provided record_hash and computes genuine SHA-256', async () => {
      const fakeRecordHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const res = await postBatch({
        record_hash: fakeRecordHash,
        feedstock: 'Crop Residue',
        mass_in_kg: 600,
        temp_c: 500,
        mass_out_kg: 180
      });

      assert.strictEqual(res.status, 201);
      assert.notStrictEqual(res.data.record_hash, fakeRecordHash, 'Server must compute authentic hash');
    });
  });

  describe('Non-Existent Resources', () => {
    it('Returns 404 Not Found for non-existent batch ID', async () => {
      const fakeId = '01HZZZZZZZZZZZZZZZZZZZZZZZ';
      const res = await getBatch(fakeId);
      assert.strictEqual(res.status, 404, `Expected 404 for missing batch, got ${res.status}`);
    });

    it('Returns 404 Not Found for non-existent batch QR code', async () => {
      const fakeId = '01HZZZZZZZZZZZZZZZZZZZZZZZ';
      const res = await getBatchQr(fakeId);
      assert.strictEqual(res.status, 404, `Expected 404 for missing batch QR, got ${res.status}`);
    });
  });

  describe('Append-Only Enforcement (HTTP 405 / 404 on Mutations)', () => {
    it('Disallows PUT /api/batches', async () => {
      const res = await request('PUT', '/api/batches', { test: true });
      assert.ok(
        [404, 405].includes(res.status),
        `Expected 405 Method Not Allowed or 404 Not Found for PUT /api/batches, got ${res.status}`
      );
    });

    it('Disallows DELETE /api/batches', async () => {
      const res = await request('DELETE', '/api/batches');
      assert.ok(
        [404, 405].includes(res.status),
        `Expected 405 Method Not Allowed or 404 Not Found for DELETE /api/batches, got ${res.status}`
      );
    });

    it('Disallows PUT /api/batches/:id', async () => {
      const res = await request('PUT', '/api/batches/01ARZ3NDEKTSV4RRFFQ69G5FAV', { mass_out_kg: 999 });
      assert.ok(
        [404, 405].includes(res.status),
        `Expected 405 Method Not Allowed or 404 Not Found for PUT /api/batches/:id, got ${res.status}`
      );
    });

    it('Disallows DELETE /api/batches/:id', async () => {
      const res = await request('DELETE', '/api/batches/01ARZ3NDEKTSV4RRFFQ69G5FAV');
      assert.ok(
        [404, 405].includes(res.status),
        `Expected 405 Method Not Allowed or 404 Not Found for DELETE /api/batches/:id, got ${res.status}`
      );
    });

    it('Disallows PATCH /api/batches/:id', async () => {
      const res = await request('PATCH', '/api/batches/01ARZ3NDEKTSV4RRFFQ69G5FAV', { notes: 'update' });
      assert.ok(
        [404, 405].includes(res.status),
        `Expected 405 Method Not Allowed or 404 Not Found for PATCH /api/batches/:id, got ${res.status}`
      );
    });
  });
});
