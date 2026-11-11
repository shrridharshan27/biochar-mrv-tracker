/**
 * Master Test Runner for Biochar MRV Tracker E2E Test Suite
 * 
 * Executes all 4 test tiers:
 * - Tier 1: Feature Coverage (tests/tier1_features.test.js)
 * - Tier 2: Boundary & Corner Cases (tests/tier2_boundaries.test.js)
 * - Tier 3: Cross-Feature Combinations (tests/tier3_combinations.test.js)
 * - Tier 4: Real-World Scenarios & Tamper Injection (tests/tier4_scenarios.test.js)
 * 
 * Ensures an active server instance, streams test progress, aggregates results,
 * and exits with code 0 on complete pass, or code 1 on failure.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const TEST_FILES = [
  'tier1_features.test.js',
  'tier2_boundaries.test.js',
  'tier3_combinations.test.js',
  'tier4_scenarios.test.js'
];

async function isServerRunning(url) {
  try {
    const res = await fetch(`${url}/api/batches`, {
      method: 'GET',
      signal: AbortSignal.timeout(1500)
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return false;
    }
    const data = await res.json();
    return Array.isArray(data);
  } catch (err) {
    return false;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  Biochar MRV Tracker — End-to-End Test Suite');
  console.log('='.repeat(70));

  let ephemeralServer = null;
  let baseUrl = process.env.TEST_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';

  const alreadyRunning = await isServerRunning(baseUrl);

  if (alreadyRunning) {
    console.log(`[Harness] Target backend detected and active at ${baseUrl}`);
  } else {
    console.log(`[Harness] No running server at ${baseUrl}. Launching ephemeral backend instance...`);
    const appPath = path.resolve(__dirname, '../server/src/app.js');

    if (!fs.existsSync(appPath)) {
      console.error(`[Harness Error] Backend entry point not found at ${appPath}`);
      process.exit(1);
    }

    try {
      const app = require(appPath);
      await new Promise((resolve, reject) => {
        ephemeralServer = app.listen(0, '127.0.0.1', () => {
          const port = ephemeralServer.address().port;
          baseUrl = `http://127.0.0.1:${port}`;
          process.env.TEST_BASE_URL = baseUrl;
          console.log(`[Harness] Ephemeral server listening on ${baseUrl}`);
          resolve();
        });
        ephemeralServer.on('error', reject);
      });
    } catch (err) {
      console.error('[Harness Error] Failed to launch ephemeral server:', err);
      process.exit(1);
    }
  }

  const testFilePaths = TEST_FILES.map((file) => path.join(__dirname, file));

  console.log(`\n[Harness] Executing ${TEST_FILES.length} test suites with Node test runner...\n`);

  const nodeArgs = ['--test', '--test-concurrency=1', ...testFilePaths];

  const child = spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      TEST_BASE_URL: baseUrl
    }
  });

  child.on('close', (code) => {
    if (ephemeralServer) {
      try {
        ephemeralServer.close();
        console.log('[Harness] Ephemeral server terminated cleanly.');
      } catch (e) {
        // Ignore
      }
    }

    console.log('\n' + '='.repeat(70));
    if (code === 0) {
      console.log('  [PASS] All test suites passed successfully (Exit code: 0)');
    } else {
      console.log(`  [FAIL] Test suite failed with exit code: ${code}`);
    }
    console.log('='.repeat(70));
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error('[Harness Fatal Error]', err);
  process.exit(1);
});
