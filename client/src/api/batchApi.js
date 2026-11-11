/**
 * Biochar MRV Tracker - Client API Service
 * Interacts with the backend append-only cryptographic ledger.
 */

const BASE_URL = '';

/**
 * Handle API response and extract structured error messages
 */
async function handleResponse(res) {
  if (!res.ok) {
    let errorMsg = `Server error (${res.status})`;
    try {
      const data = await res.json();
      if (data && data.error) {
        errorMsg = data.error;
      }
    } catch {
      // not JSON
      try {
        const text = await res.text();
        if (text) errorMsg = text;
      } catch {
        // fallback
      }
    }
    const err = new Error(errorMsg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Fetch all batches ordered by timestamp ascending
 */
export async function getBatches() {
  const res = await fetch(`${BASE_URL}/api/batches`);
  return handleResponse(res);
}

/**
 * Fetch a single batch by ULID
 */
export async function getBatch(id) {
  const res = await fetch(`${BASE_URL}/api/batches/${encodeURIComponent(id)}`);
  return handleResponse(res);
}

/**
 * Create a new batch record in the cryptographic ledger
 * @param {Object} batchData
 * @param {string} batchData.feedstock - 'Wood' | 'Rice Husk' | 'Crop Residue' | 'Bamboo' | 'Other'
 * @param {number} batchData.mass_in_kg - Positive number
 * @param {number} batchData.temp_c - Positive number
 * @param {number} batchData.mass_out_kg - Positive number <= mass_in_kg
 * @param {string} [batchData.notes] - Optional notes
 */
export async function createBatch(batchData) {
  const res = await fetch(`${BASE_URL}/api/batches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(batchData),
  });
  return handleResponse(res);
}

/**
 * Verify cryptographic hash chain integrity
 * Returns { valid: boolean, broken_at: string | null }
 */
export async function verifyChain() {
  const res = await fetch(`${BASE_URL}/api/verify`);
  return handleResponse(res);
}

/**
 * Get QR code image URL for a batch
 */
export function getQrImageUrl(id) {
  return `${BASE_URL}/api/batches/${encodeURIComponent(id)}/qr`;
}

/**
 * Get CSV export URL
 */
export function getCsvExportUrl() {
  return `${BASE_URL}/api/export/csv`;
}
