const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { initDB } = require('../src/db');
const { createApp } = require('../src/app');

describe('REST API & Append-Only Ledger Integration Tests', () => {
  let db;
  let app;

  beforeEach(() => {
    // Isolated in-memory database for each test suite run
    db = initDB(':memory:');
    app = createApp({ db });
  });

  describe('POST /api/batches (Batch Logging)', () => {
    it('creates genesis batch with status 201 and prev_hash = ""', async () => {
      const payload = {
        feedstock: 'Wood',
        mass_in_kg: 1000,
        temp_c: 550,
        mass_out_kg: 300,
        notes: 'Initial test batch'
      };

      const res = await request(app)
        .post('/api/batches')
        .send(payload)
        .expect(201);

      assert.ok(res.body.id);
      assert.equal(res.body.id.length, 26);
      assert.equal(res.body.feedstock, 'Wood');
      assert.equal(res.body.mass_in_kg, 1000);
      assert.equal(res.body.temp_c, 550);
      assert.equal(res.body.mass_out_kg, 300);
      assert.equal(res.body.notes, 'Initial test batch');
      assert.equal(res.body.co2_kg, 300 * 0.60 * 3.67);
      assert.equal(res.body.prev_hash, '');
      assert.ok(res.body.record_hash);
      assert.equal(res.body.record_hash.length, 64);
    });

    it('chains subsequent records to immediate predecessor record_hash', async () => {
      const b1Res = await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Wood', mass_in_kg: 1000, temp_c: 500, mass_out_kg: 300 })
        .expect(201);

      const b2Res = await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Rice Husk', mass_in_kg: 800, temp_c: 480, mass_out_kg: 240 })
        .expect(201);

      assert.equal(b1Res.body.prev_hash, '');
      assert.equal(b2Res.body.prev_hash, b1Res.body.record_hash);
    });

    it('strictly calculates co2_kg server-side and ignores client co2_kg payload', async () => {
      const payload = {
        feedstock: 'Bamboo',
        mass_in_kg: 500,
        temp_c: 520,
        mass_out_kg: 100,
        co2_kg: 999999.99, // Malicious override attempt
        prev_hash: 'fake_hash',
        record_hash: 'fake_hash'
      };

      const res = await request(app)
        .post('/api/batches')
        .send(payload)
        .expect(201);

      // Expected: 100 * 0.60 * 3.67 = 220.2
      assert.equal(res.body.co2_kg, 220.2);
      assert.notEqual(res.body.prev_hash, 'fake_hash');
      assert.notEqual(res.body.record_hash, 'fake_hash');
    });

    it('rejects invalid feedstock with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Plastic', mass_in_kg: 100, temp_c: 500, mass_out_kg: 30 })
        .expect(400);

      assert.ok(res.body.error);
      assert.ok(res.body.details.some(d => d.includes('feedstock')));
    });

    it('rejects negative or zero numbers with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Wood', mass_in_kg: -10, temp_c: 0, mass_out_kg: -5 })
        .expect(400);

      assert.equal(res.status, 400);
      assert.ok(res.body.details.length >= 3);
    });

    it('rejects when mass_out_kg exceeds mass_in_kg with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Wood', mass_in_kg: 100, temp_c: 500, mass_out_kg: 200 })
        .expect(400);

      assert.ok(res.body.details.some(d => d.includes('cannot exceed input feedstock mass')));
    });
  });

  describe('GET /api/batches (Batch Listing)', () => {
    it('returns empty array when ledger is empty', async () => {
      const res = await request(app)
        .get('/api/batches')
        .expect(200);

      assert.deepEqual(res.body, []);
    });

    it('returns all batches ordered by timestamp ascending', async () => {
      await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Wood', mass_in_kg: 500, temp_c: 500, mass_out_kg: 150 });
      await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Bamboo', mass_in_kg: 400, temp_c: 520, mass_out_kg: 120 });

      const res = await request(app)
        .get('/api/batches')
        .expect(200);

      assert.equal(res.body.length, 2);
      assert.equal(res.body[0].feedstock, 'Wood');
      assert.equal(res.body[1].feedstock, 'Bamboo');
    });
  });

  describe('GET /api/batches/:id (Batch Details)', () => {
    it('returns 200 and batch details for existing ULID', async () => {
      const createRes = await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Wood', mass_in_kg: 500, temp_c: 500, mass_out_kg: 150, notes: 'Special batch' });

      const batchId = createRes.body.id;

      const res = await request(app)
        .get(`/api/batches/${batchId}`)
        .expect(200);

      assert.equal(res.body.id, batchId);
      assert.equal(res.body.notes, 'Special batch');
    });

    it('returns 404 Not Found for non-existent ULID', async () => {
      const res = await request(app)
        .get('/api/batches/01NONEXISTENT00000000000000')
        .expect(404);

      assert.ok(res.body.error);
    });
  });

  describe('GET /api/batches/:id/qr (QR Code Generator)', () => {
    it('returns 200 with image/png and valid PNG header bytes', async () => {
      const createRes = await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Crop Residue', mass_in_kg: 600, temp_c: 530, mass_out_kg: 180 });

      const batchId = createRes.body.id;

      const res = await request(app)
        .get(`/api/batches/${batchId}/qr`)
        .expect(200)
        .expect('Content-Type', 'image/png');

      assert.ok(res.body);
      assert.ok(Buffer.isBuffer(res.body));
      // PNG header magic bytes: 0x89, 'P', 'N', 'G' (89 50 4e 47)
      assert.equal(res.body[0], 0x89);
      assert.equal(res.body[1], 0x50);
      assert.equal(res.body[2], 0x4e);
      assert.equal(res.body[3], 0x47);
    });

    it('returns 404 for QR code of non-existent batch', async () => {
      await request(app)
        .get('/api/batches/01NONEXISTENT00000000000000/qr')
        .expect(404);
    });
  });

  describe('GET /api/export/csv (CSV Export)', () => {
    it('returns 200 with text/csv header and header columns for empty ledger', async () => {
      const res = await request(app)
        .get('/api/export/csv')
        .expect(200)
        .expect('Content-Type', /text\/csv/);

      assert.ok(res.text.includes('id'));
      assert.ok(res.text.includes('timestamp'));
      assert.ok(res.text.includes('feedstock'));
      assert.ok(res.text.includes('mass_in_kg'));
      assert.ok(res.text.includes('temp_c'));
      assert.ok(res.text.includes('mass_out_kg'));
      assert.ok(res.text.includes('co2_kg'));
      assert.ok(res.text.includes('prev_hash'));
      assert.ok(res.text.includes('record_hash'));
    });

    it('exports all batch records matching ledger content', async () => {
      await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Wood', mass_in_kg: 1000, temp_c: 550, mass_out_kg: 300, notes: 'Dry Oak, Grade A' });

      const res = await request(app)
        .get('/api/export/csv')
        .expect(200);

      assert.ok(res.text.includes('Wood'));
      assert.ok(res.text.includes('Dry Oak, Grade A'));
      assert.ok(res.text.includes('660.6'));
    });
  });

  describe('GET /api/verify (Audit Trail Verification)', () => {
    it('returns { valid: true, broken_at: null } on untampered ledger', async () => {
      await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Wood', mass_in_kg: 1000, temp_c: 550, mass_out_kg: 300 });
      await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Bamboo', mass_in_kg: 800, temp_c: 500, mass_out_kg: 240 });

      const res = await request(app)
        .get('/api/verify')
        .expect(200);

      assert.deepEqual(res.body, { valid: true, broken_at: null });
    });

    it('returns { valid: false, broken_at: <id> } when data is tampered in SQLite', async () => {
      const b1 = await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Wood', mass_in_kg: 1000, temp_c: 550, mass_out_kg: 300 });
      const b2 = await request(app)
        .post('/api/batches')
        .send({ feedstock: 'Bamboo', mass_in_kg: 800, temp_c: 500, mass_out_kg: 240 });

      // Maliciously alter b2 temp_c
      db.prepare('UPDATE batches SET temp_c = 999 WHERE id = ?').run(b2.body.id);

      const res = await request(app)
        .get('/api/verify')
        .expect(200);

      assert.equal(res.body.valid, false);
      assert.equal(res.body.broken_at, b2.body.id);
    });
  });

  describe('Strict Append-Only Enforcement (Method Guards)', () => {
    it('rejects PUT /api/batches with 405 Method Not Allowed', async () => {
      const res = await request(app)
        .put('/api/batches')
        .send({ feedstock: 'Wood' })
        .expect(405);

      assert.ok(res.body.error);
    });

    it('rejects PUT /api/batches/:id with 405 Method Not Allowed', async () => {
      const res = await request(app)
        .put('/api/batches/01HQ6ZF800P0Q7RSTUVWXY1234')
        .send({ feedstock: 'Wood' })
        .expect(405);

      assert.ok(res.body.error);
    });

    it('rejects PATCH /api/batches/:id with 405 Method Not Allowed', async () => {
      const res = await request(app)
        .patch('/api/batches/01HQ6ZF800P0Q7RSTUVWXY1234')
        .send({ notes: 'updated' })
        .expect(405);

      assert.ok(res.body.error);
    });

    it('rejects DELETE /api/batches/:id with 405 Method Not Allowed', async () => {
      const res = await request(app)
        .delete('/api/batches/01HQ6ZF800P0Q7RSTUVWXY1234')
        .expect(405);

      assert.ok(res.body.error);
    });

    it('rejects DELETE /api/verify with 405 Method Not Allowed', async () => {
      const res = await request(app)
        .delete('/api/verify')
        .expect(405);

      assert.ok(res.body.error);
    });
  });
});
