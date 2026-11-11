const express = require('express');
const QRCode = require('qrcode');
const { Parser } = require('json2csv');
const { getDB } = require('./db');
const {
  insertBatchRecord,
  getAllBatches,
  getBatchById,
  verifyChain
} = require('./ledger');

const router = express.Router();

const ALLOWED_FEEDSTOCKS = ['Wood', 'Rice Husk', 'Crop Residue', 'Bamboo', 'Other'];

/**
 * Helper to retrieve active DB instance from app.locals or fallback to default.
 */
function resolveDB(req) {
  return (req.app && req.app.locals && req.app.locals.db) ? req.app.locals.db : getDB();
}

/**
 * Append-Only Enforcement Middleware for /api/*
 * Explicitly rejects PUT, PATCH, and DELETE operations with 405 Method Not Allowed.
 */
router.use((req, res, next) => {
  const allowed = ['GET', 'POST', 'HEAD', 'OPTIONS'];
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, HEAD, OPTIONS');
    return res.status(405).json({
      error: `Method ${req.method} not allowed on append-only ledger`,
      allowed: ['GET', 'POST']
    });
  }
  next();
});

/**
 * POST /api/batches
 * Validates inputs, computes CO2, chains hash, and persists batch record.
 */
router.post('/batches', (req, res) => {
  const db = resolveDB(req);
  const { feedstock, mass_in_kg, temp_c, mass_out_kg, notes } = req.body || {};
  const errors = [];

  // Validate feedstock
  if (!feedstock || typeof feedstock !== 'string' || !ALLOWED_FEEDSTOCKS.includes(feedstock)) {
    errors.push(`feedstock must be one of: ${ALLOWED_FEEDSTOCKS.join(', ')}`);
  }

  // Validate mass_in_kg
  const massIn = Number(mass_in_kg);
  if (mass_in_kg === undefined || mass_in_kg === null || isNaN(massIn) || massIn <= 0) {
    errors.push('mass_in_kg must be a positive number greater than 0');
  }

  // Validate temp_c
  const temp = Number(temp_c);
  if (temp_c === undefined || temp_c === null || isNaN(temp) || temp <= 0) {
    errors.push('temp_c must be a positive number greater than 0');
  }

  // Validate mass_out_kg
  const massOut = Number(mass_out_kg);
  if (mass_out_kg === undefined || mass_out_kg === null || isNaN(massOut) || massOut <= 0) {
    errors.push('mass_out_kg must be a positive number greater than 0');
  } else if (!isNaN(massIn) && massIn > 0 && massOut > massIn) {
    errors.push('Output mass (mass_out_kg) cannot exceed input feedstock mass (mass_in_kg)');
  }

  // Validate notes (optional)
  if (notes !== undefined && notes !== null && typeof notes === 'string' && notes.length > 10000) {
    errors.push('notes must not exceed 10000 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  try {
    const record = insertBatchRecord(db, {
      feedstock,
      mass_in_kg: massIn,
      temp_c: temp,
      mass_out_kg: massOut,
      notes: notes !== undefined && notes !== null ? String(notes) : ''
    });

    return res.status(201).json(record);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to persist batch record',
      message: err.message
    });
  }
});

/**
 * GET /api/batches
 * Returns all batches ordered chronologically by timestamp ascending.
 */
router.get('/batches', (req, res) => {
  const db = resolveDB(req);
  try {
    const batches = getAllBatches(db);
    return res.status(200).json(batches);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to retrieve batches',
      message: err.message
    });
  }
});

/**
 * GET /api/verify
 * Traverses and verifies entire hash chain integrity.
 */
router.get('/verify', (req, res) => {
  const db = resolveDB(req);
  try {
    const result = verifyChain(db);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to verify chain integrity',
      message: err.message
    });
  }
});

/**
 * GET /api/export/csv
 * Exports complete batch audit trail in RFC 4180 CSV format.
 */
router.get('/export/csv', (req, res) => {
  const db = resolveDB(req);
  try {
    const batches = getAllBatches(db);
    const fields = [
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
    const parser = new Parser({ fields });
    const csv = parser.parse(batches);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="biochar_batches_audit_trail.csv"');
    return res.status(200).send(csv);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to generate CSV export',
      message: err.message
    });
  }
});

/**
 * GET /api/batches/:id/qr
 * Returns PNG QR code encoding batch verification JSON payload.
 */
router.get('/batches/:id/qr', async (req, res) => {
  const db = resolveDB(req);
  try {
    const batch = getBatchById(db, req.params.id);
    if (!batch) {
      return res.status(404).json({
        error: 'Batch not found',
        id: req.params.id
      });
    }

    const payload = JSON.stringify({
      id: batch.id,
      hash: batch.record_hash,
      app: 'biochar-mrv'
    });

    const pngBuffer = await QRCode.toBuffer(payload, {
      type: 'png',
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="batch-${batch.id}-qr.png"`);
    return res.status(200).send(pngBuffer);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to generate QR code',
      message: err.message
    });
  }
});

/**
 * GET /api/batches/:id
 * Returns single batch details by ULID.
 */
router.get('/batches/:id', (req, res) => {
  const db = resolveDB(req);
  try {
    const batch = getBatchById(db, req.params.id);
    if (!batch) {
      return res.status(404).json({
        error: 'Batch not found',
        id: req.params.id
      });
    }
    return res.status(200).json(batch);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to retrieve batch',
      message: err.message
    });
  }
});

module.exports = router;
