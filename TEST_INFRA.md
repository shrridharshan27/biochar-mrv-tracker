# Test Infrastructure & Specification: Biochar MRV Tracker

**Document Identifier**: `TEST-INFRA-001`  
**Author**: E2E Test Architect (E2E Testing Track)  
**Project**: Biochar MRV Tracker  
**Target Milestone**: M-Test / Requirement R4  
**Date**: November 2026  
**Status**: APPROVED & ACTIVE  

---

## 1. Test Philosophy

The testing framework for the Biochar MRV Tracker is designed as an **opaque-box, requirement-driven, end-to-end verification harness**.

### Key Principles:
1. **Opaque-Box Boundary**: Tests interact with the system strictly through public HTTP APIs (`/api/*`), standard database states, and observable outputs (JSON, PNG, CSV). Tests do not rely on private internal helper functions, guaranteeing that tests validate user requirements rather than implementation idiosyncrasies.
2. **Authoritative Specification Derivation**: Every test assertion is derived directly from `ORIGINAL_REQUEST.md` and the formal technical surveys (`survey_backend.md`, `survey_frontend_packaging.md`).
3. **Cryptographic & Mathematical Rigor**: Tests execute real mathematical derivations ($CO_2 = \text{mass\_out\_kg} \times 0.60 \times 3.67$) and real SHA-256 cryptographic validations across the hash chain. Zero dummy facades or hardcoded mock responses are permitted.
4. **Adversarial Tamper Verification**: The test suite actively injects deliberate data corruption into SQLite records to verify that the verification engine (`GET /api/verify`) reliably catches tampering, isolates the exact record ULID (`broken_at`), and detects breaks across both predecessor links (`prev_hash`) and payload hashes (`record_hash`).
5. **Zero External Test Runner Bloat**: Uses the native Node.js test runner (`node:test`) and strict assertions (`node:assert/strict`) supported out of the box in Node 24 with native async/await, test suites, and subtest trees.

---

## 2. Feature Inventory (F01 – F20)

Derived from `ORIGINAL_REQUEST.md`, `plan.md`, and technical surveys:

| Feature ID | Category | Feature Name | Description | Authoritative Source |
|---|---|---|---|---|
| **F01** | Ideation | Climate-Tech Ideation Proposals | 4 deep project proposals for high-durability carbon removal (SOC dMRV, Agroforestry Biomass, Rice AWD Methane, ERW Mass Balance). | `ORIGINAL_REQUEST.md` § R1 |
| **F02** | Ideation | Ideation Comparative Evaluation | 8-criteria comparative evaluation matrix evaluating proposals against Biochar MRV Tracker. | `ORIGINAL_REQUEST.md` § R1 |
| **F03** | Ideation | `IDEAS.md` Document | Formal documentation of climate-tech proposals and comparative matrix in repository root. | `ORIGINAL_REQUEST.md` § R1 |
| **F04** | Backend | Append-Only SQLite Schema | SQLite schema with ULID primary keys, ISO 8601 timestamps, numeric masses and temperature, notes, and cryptographic hashes. | `ORIGINAL_REQUEST.md` § R2 |
| **F05** | Backend | Strict Append-Only Enforcement | No `UPDATE` or `DELETE` routes (HTTP 405 Method Not Allowed), no soft-deletes, no database triggers or hooks. | `ORIGINAL_REQUEST.md` § R2 |
| **F06** | Backend | Server-Side $CO_2$ Computation | Deterministic server calculation `mass_out_kg * 0.60 * 3.67`; strictly rejects or overrides client input. | `ORIGINAL_REQUEST.md` § R2 |
| **F07** | Backend | Cryptographic Hash Chaining | SHA-256 over 9 fields + `prev_hash`; genesis `prev_hash` is `""`; subsequent batches link to predecessor's `record_hash`. | `ORIGINAL_REQUEST.md` § R2 |
| **F08** | API | Batch Creation API (`POST /api/batches`) | Validates body, restricts feedstock enum, checks mass bounds, computes $CO_2$ and hashes, atomically inserts record. | `ORIGINAL_REQUEST.md` § R2 |
| **F09** | API | Batch Listing API (`GET /api/batches`) | Returns all logged batches ordered by `timestamp ASC`. | `ORIGINAL_REQUEST.md` § R2 |
| **F10** | API | Batch Detail API (`GET /api/batches/:id`) | Returns single batch details by ULID or 404 Not Found. | `ORIGINAL_REQUEST.md` § R2 |
| **F11** | API | QR Code API (`GET /api/batches/:id/qr`) | Generates PNG QR code encoding JSON `{ id, hash: record_hash, app: "biochar-mrv" }`. | `ORIGINAL_REQUEST.md` § R2 |
| **F12** | API | CSV Export API (`GET /api/export/csv`) | Exports complete audit trail in RFC 4180 CSV format via `json2csv`. | `ORIGINAL_REQUEST.md` § R2 |
| **F13** | API | Chain Verification API (`GET /api/verify`) | Sequential ledger traversal returning `{ valid: bool, broken_at: id \| null }`. | `ORIGINAL_REQUEST.md` § R2 |
| **F14** | Frontend | Dashboard View (`/`) | Summary KPI cards (Batches, $CO_2$, Biochar Output), batch table, action buttons, verify toast. | `ORIGINAL_REQUEST.md` § R3 |
| **F15** | Frontend | Log Batch Form (`/log`) | Validated form with feedstock dropdown, numeric validation, formula assumptions disclaimer. | `ORIGINAL_REQUEST.md` § R3 |
| **F16** | Frontend | Batch Detail View (`/batch/:id`) | Record attributes, prominent $CO_2$, QR image, monospace hashes, chain status badge. | `ORIGINAL_REQUEST.md` § R3 |
| **F17** | Frontend | Responsive UI & Toast Notifications | Pure Tailwind CSS styling, mobile-friendly layout, zero external component libraries, custom toast system. | `ORIGINAL_REQUEST.md` § R3 |
| **F18** | Packaging | Root Packaging & Monorepo Scripts | Unified root `package.json` with `dev`, `build`, and `start` scripts; single-port production static serving. | `ORIGINAL_REQUEST.md` § R4 |
| **F19** | Packaging | Comprehensive Documentation (`README.md`)| Setup guide, $CO_2$ formula derivation, hash verification mechanics, API endpoints. | `ORIGINAL_REQUEST.md` § R4 |
| **F20** | Packaging | Automated Verification Test Suite | Automated test suite covering hash calculation, chain integrity, tamper detection, $CO_2$ formula, API endpoints, CSV. | `ORIGINAL_REQUEST.md` § R4 |

---

## 3. Test Architecture & Runner Invocation

### 3.1 Directory Layout
```
biochar-mrv-tracker/
├── TEST_INFRA.md                  # This specification
├── TEST_READY.md                  # Test execution report and instructions
└── tests\
    ├── helpers.js                 # Shared HTTP client, ephemeral server lifecycle, assertions, DB access
    ├── run_tests.js               # CLI Master Test Runner with exit code handling
    ├── tier1_features.test.js     # Tier 1: Feature Coverage (Happy Path)
    ├── tier2_boundaries.test.js   # Tier 2: Boundary & Corner Cases
    ├── tier3_combinations.test.js # Tier 3: Cross-Feature Integration Workflows
    └── tier4_scenarios.test.js    # Tier 4: Real-World Facility Simulation & Tamper Injection
```

### 3.2 Test Runner & Environment
- **Runtime**: Node.js v24+ (native ESM and CommonJS compatible).
- **Test Engine**: `node:test` (Node's built-in test runner) + `node:assert/strict`.
- **HTTP Transport**: Native `fetch` with streaming response inspection and buffer parsing.
- **Server Lifecycle**:
  - Tests communicate with the backend at `process.env.TEST_BASE_URL` or `http://localhost:3000`.
  - `tests/helpers.js` provides automatic detection: if a live server is running, tests execute against it. If no server is running, the test harness can automatically instantiate an ephemeral Express instance using the application definition in `server/src/app.js` or `server/src/server.js`, binding to an ephemeral available port.
- **Invocation Command**:
  ```bash
  # Execute full test suite via runner script
  node tests/run_tests.js

  # Or execute directly via Node's native test runner
  node --test tests/*.test.js
  ```
- **Pass/Fail Semantics**:
  - Exit code `0`: All tests passed across all 4 tiers.
  - Exit code `1`: One or more test assertions failed, unhandled rejections occurred, or test harness timed out.

---

## 4. 4-Tier Test Methodology

```
+-------------------------------------------------------------------------+
|                                 TIER 4                                  |
|         Real-World Workloads, Tamper Injection & Chain Recovery          |
|   (10+ Batch Facility Simulation, Malicious SQL Updates, Broken Chains) |
+-------------------------------------------------------------------------+
                                     ^
+-------------------------------------------------------------------------+
|                                 TIER 3                                  |
|                     Cross-Feature Combinations                          |
|  (Genesis -> Chaining -> Batch Detail -> QR PNG -> CSV Export -> Verify) |
+-------------------------------------------------------------------------+
                                     ^
+-------------------------------------------------------------------------+
|                                 TIER 2                                  |
|                       Boundary & Corner Cases                           |
|  (Invalid Enums, <=0 Masses, mass_out > mass_in, 405 Method Not Allowed)|
+-------------------------------------------------------------------------+
                                     ^
+-------------------------------------------------------------------------+
|                                 TIER 1                                  |
|                       Feature Coverage (Happy Path)                     |
|  (Individual Endpoint Contracts, CO2 Calculation, Genesis prev_hash="")|
+-------------------------------------------------------------------------+
```

### 4.1 Tier 1: Feature Coverage (Isolation & Happy Path)
Tests verify the nominal, specification-compliant behavior of each individual backend capability in isolation:
1. **Batch Creation (`POST /api/batches`)**:
   - Submitting valid payloads for each allowed feedstock (`Wood`, `Rice Husk`, `Crop Residue`, `Bamboo`, `Other`).
   - Asserts HTTP 201 Created.
   - Asserts response contains valid 26-character Crockford Base32 ULID `id`.
   - Asserts response contains valid ISO 8601 UTC timestamp.
2. **CO₂ Computation Formula ($CO_2 = \text{mass\_out\_kg} \times 0.60 \times 3.67$)**:
   - Validates precision against the scientific formula:
     * $100\text{ kg out} \to 220.20\text{ kg } CO_2$.
     * $250.5\text{ kg out} \to 551.8515\text{ kg } CO_2$.
     * $10\text{ kg out} \to 22.02\text{ kg } CO_2$.
   - Client-supplied `co2_kg` is strictly ignored; server formula is always enforced.
3. **Genesis Record previous hash**:
   - The first record in the database must have `prev_hash === ""`.
4. **Batch Listing (`GET /api/batches`)**:
   - Returns HTTP 200 OK with JSON array ordered chronologically by `timestamp ASC`.
5. **Batch Detail (`GET /api/batches/:id`)**:
   - Returns HTTP 200 OK with matching record attributes for a known ULID.
6. **QR Code Generator (`GET /api/batches/:id/qr`)**:
   - Returns HTTP 200 OK with `Content-Type: image/png`.
   - Verifies binary PNG magic header signature (`0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A`).
7. **CSV Export (`GET /api/export/csv`)**:
   - Returns HTTP 200 OK with `Content-Type: text/csv`.
   - Asserts presence of required header columns: `id,timestamp,feedstock,mass_in_kg,temp_c,mass_out_kg,notes,co2_kg,prev_hash,record_hash`.
8. **Audit Verification (`GET /api/verify`)**:
   - Returns HTTP 200 OK with `{ valid: true, broken_at: null }` on an untampered ledger.

### 4.2 Tier 2: Boundary & Corner Cases
Tests verify rejection semantics, input sanitization, and defensive error handling:
1. **Invalid Feedstock Rejection**:
   - Rejects non-enumerated strings (`"Coal"`, `"Plastic"`, `"unknown"`, `"WOOD"` [case sensitive]).
   - Rejects empty feedstock `""`, `null`, `undefined`, or numeric values.
   - Asserts HTTP 400 Bad Request with descriptive error.
2. **Non-Positive & Zero Numeric Values**:
   - `mass_in_kg = 0` and `mass_in_kg = -50` $\to$ HTTP 400 Bad Request.
   - `temp_c = 0` and `temp_c = -200` $\to$ HTTP 400 Bad Request.
   - `mass_out_kg = 0` and `mass_out_kg = -10` $\to$ HTTP 400 Bad Request.
3. **Mass Balance Violation**:
   - Output mass cannot exceed input mass: `mass_out_kg > mass_in_kg` (e.g. In: 100 kg, Out: 250 kg) $\to$ HTTP 400 Bad Request.
4. **Type Mismatch & Missing Attributes**:
   - String values for numeric fields (`mass_in_kg = "one hundred"`).
   - Omitted required fields (e.g. missing `temp_c` or `feedstock`).
   - Asserts HTTP 400 Bad Request.
5. **Notes Boundary Conditions**:
   - `notes` omitted $\to$ defaults to empty string `""`.
   - `notes = null` $\to$ coerced to empty string `""`.
   - `notes` containing special characters (commas, double quotes, newlines, UTF-8 unicode, emojis) handled cleanly in SHA-256 concatenation and CSV escaping.
6. **Client Override Discarding**:
   - Client sends fake `id`, `timestamp`, `prev_hash`, or `record_hash` in POST body $\to$ server discards client values and generates genuine cryptographic tokens.
7. **Non-Existent Resource Lookup**:
   - `GET /api/batches/NON_EXISTENT_ULID_000000` $\to$ HTTP 404 Not Found.
   - `GET /api/batches/NON_EXISTENT_ULID_000000/qr` $\to$ HTTP 404 Not Found.
8. **Append-Only HTTP Method Restrictions**:
   - `PUT /api/batches` and `PUT /api/batches/:id` $\to$ HTTP 405 Method Not Allowed (or 404).
   - `DELETE /api/batches` and `DELETE /api/batches/:id` $\to$ HTTP 405 Method Not Allowed (or 404).
   - `PATCH /api/batches/:id` $\to$ HTTP 405 Method Not Allowed (or 404).

### 4.3 Tier 3: Cross-Feature Combinations
Tests verify multi-step end-to-end user workflows and state transitions across features:
1. **End-to-End Audit Chain Pipeline**:
   - Step 1: Query initial verification status (`GET /api/verify`).
   - Step 2: Post Genesis batch (`POST /api/batches`) with `Crop Residue`.
   - Step 3: Verify Genesis `prev_hash === ""`.
   - Step 4: Post Batch 2 (`Bamboo`) and Batch 3 (`Rice Husk`).
   - Step 5: Verify Batch 2 `prev_hash === Batch 1.record_hash`.
   - Step 6: Verify Batch 3 `prev_hash === Batch 2.record_hash`.
   - Step 7: Recompute SHA-256 hash independently over `id + timestamp + feedstock + mass_in_kg + temp_c + mass_out_kg + notes + co2_kg + prev_hash` and verify byte-for-byte identity with stored `record_hash`.
2. **List-to-Detail Consistency**:
   - Retrieve full ledger via `GET /api/batches`.
   - For every batch returned, retrieve `GET /api/batches/:id` and assert all fields (`id`, `timestamp`, `feedstock`, `mass_in_kg`, `temp_c`, `mass_out_kg`, `notes`, `co2_kg`, `prev_hash`, `record_hash`) match identically.
3. **QR Code Verification & Payload Contract**:
   - Query `GET /api/batches/:id/qr` for each batch.
   - Verify image content is PNG format and payload correlates with the record's ID and hash.
4. **CSV Export Reconciliation**:
   - Query `GET /api/export/csv`.
   - Parse the CSV text into structured rows.
   - Reconcile row count with `GET /api/batches` array length.
   - Reconcile individual column values and verify RFC 4180 quote escaping on records with notes containing commas and quotes.
5. **Chain Verification After Sequential Additions**:
   - Query `GET /api/verify` and verify unbroken state `{ valid: true, broken_at: null }`.

### 4.4 Tier 4: Real-World Workload Scenarios & Tamper Injection
Tests simulate realistic biochar production operations and execute rigorous tamper attacks:
1. **Realistic Production Facility Simulation**:
   - Generate a continuous sequence of 10+ batches representing an active pyrolysis facility.
   - Cycle through realistic biomass mixes (`Wood`, `Rice Husk`, `Crop Residue`, `Bamboo`, `Other`).
   - Realistic kiln temperature variations ($450^\circ\text{C} - 720^\circ\text{C}$).
   - Compute running cumulative aggregates ($CO_2$ sequestered and biochar output) and verify against the ledger totals.
2. **Concurrent Batch Logging**:
   - Dispatch multiple concurrent `POST /api/batches` requests.
   - Verify that SQLite transaction serialization ensures zero race conditions, monotonic row sequence, and unbroken hash pointer linkage.
3. **Malicious Tamper Injection & Exact Detection**:
   - **Tamper Scenario A (Yield Falsification)**:
     Directly mutate `mass_out_kg` on record #4 via SQL `UPDATE batches SET mass_out_kg = 999.0 WHERE id = ...`.
     Execute `GET /api/verify`. Asserts `{ valid: false, broken_at: "<id_of_record_4>" }`.
   - **Tamper Scenario B (Notes / Text Modification)**:
     Directly mutate `notes` on record #2 via SQL `UPDATE batches SET notes = 'tampered notes' WHERE id = ...`.
     Execute `GET /api/verify`. Asserts `{ valid: false, broken_at: "<id_of_record_2>" }`.
   - **Tamper Scenario C (Prev Hash Link Disruption)**:
     Directly alter `prev_hash` on record #6 to a corrupted 64-char hash.
     Execute `GET /api/verify`. Asserts `{ valid: false, broken_at: "<id_of_record_6>" }`.
   - **Tamper Scenario D (Record Hash Replacement)**:
     Directly alter `record_hash` on record #3.
     Execute `GET /api/verify`. Asserts `{ valid: false, broken_at: "<id_of_record_3>" }`.
   - **Tamper Scenario E (Genesis Block Corruption)**:
     Directly alter genesis record `prev_hash` from `""` to `"tampered_root_hash"`.
     Execute `GET /api/verify`. Asserts `{ valid: false, broken_at: "<genesis_id>" }`.
   - **Tamper Scenario F (Tamper Recovery)**:
     Roll back / restore the corrupted record to its authentic state.
     Execute `GET /api/verify`. Asserts chain returns to valid: `{ valid: true, broken_at: null }`.

---

## 5. Verification & Coverage Matrix

| Test Suite File | Tiers Covered | Target Features | Expected Exit Code |
|---|---|---|---|
| `tests/tier1_features.test.js` | Tier 1 (Happy Path) | F04, F06, F07, F08, F09, F10, F11, F12, F13 | 0 (All pass) |
| `tests/tier2_boundaries.test.js` | Tier 2 (Boundaries) | F05, F06, F08, F10, F11 | 0 (All pass) |
| `tests/tier3_combinations.test.js`| Tier 3 (Integration) | F06, F07, F08, F09, F10, F11, F12, F13 | 0 (All pass) |
| `tests/tier4_scenarios.test.js` | Tier 4 (Workloads & Tamper) | F04, F05, F07, F08, F13 | 0 (All pass) |

---
*End of Test Infrastructure Specification.*
