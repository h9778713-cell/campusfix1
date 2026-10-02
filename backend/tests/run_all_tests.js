/**
 * CampusFix - Master Test Runner
 * Executes all stage verification suites sequentially with consolidated reporting.
 */
const { spawn } = require('child_process');
const path = require('path');

const suites = [
  { name: 'Stage 3: Backend Setup & DB Core', file: 'stage3_verification.js' },
  { name: 'Stage 4: Auth & RBAC Security', file: 'stage4_auth.test.js' },
  { name: 'Stage 5: Complaint APIs & Routing', file: 'stage5_complaints.test.js' },
  { name: 'Stage 6: Comments, History & Assign', file: 'stage6_features.test.js' },
  { name: 'Stage 7: Image Uploads & Magic Bytes', file: 'stage7_upload.test.js' },
  { name: 'Stage 8: Frontend Pages & Layouts', file: 'stage8_frontend.test.js' },
  { name: 'Stage 9: Full Integration & Contracts', file: 'stage9_integration.test.js' },
  { name: 'Stage 10: Analytics & Dashboard', file: 'stage10_analytics.test.js' },
  { name: 'Stage 11: Validation & Polish UX', file: 'stage11_polish.test.js' },
  { name: 'Stage 12: Security Hardening & Audit', file: 'stage12_security.test.js' },
  { name: 'Stage 13: E2E QA & System Regression', file: 'stage13_e2e_qa.test.js' }
];

console.log('===============================================================');
console.log('   CampusFix — Master Regression & Verification Runner');
console.log('===============================================================\n');

const results = [];
let currentIndex = 0;

function runNextSuite() {
  if (currentIndex >= suites.length) {
    printSummary();
    return;
  }

  const suite = suites[currentIndex];
  const filePath = path.join(__dirname, suite.file);
  const startTime = Date.now();

  console.log(`[${currentIndex + 1}/${suites.length}] RUNNING: ${suite.name} (${suite.file})...`);

  const proc = spawn(process.execPath, [filePath], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });

  proc.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  proc.on('close', code => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Parse pass/fail if available
    let summaryMatch = stdout.match(/Results: (\d+) passed, (\d+) failed/i) ||
                       stdout.match(/(\d+) passed, (\d+) failed/i) ||
                       stdout.match(/(\d+) passed/i);

    let passedCount = 0;
    let failedCount = 0;

    if (summaryMatch) {
      passedCount = parseInt(summaryMatch[1], 10) || 0;
      failedCount = summaryMatch[2] ? parseInt(summaryMatch[2], 10) : 0;
    } else if (code === 0) {
      // Look for individual "PASS" occurrences
      const passMatches = stdout.match(/\bPASS\b/g);
      passedCount = passMatches ? passMatches.length : 1;
    }

    const success = code === 0;
    results.push({
      name: suite.name,
      file: suite.file,
      success,
      code,
      elapsed,
      passedCount,
      failedCount,
      stdout,
      stderr
    });

    if (success) {
      console.log(`   --> PASS (${passedCount} tests passed in ${elapsed}s)\n`);
    } else {
      console.error(`   --> FAIL (exit code ${code} after ${elapsed}s)`);
      if (stderr) console.error(`   Errors: ${stderr.trim()}`);
      console.log('');
    }

    currentIndex++;
    // Small delay to allow any DB connection pool cooldown
    setTimeout(runNextSuite, 350);
  });
}

function printSummary() {
  console.log('\n===============================================================');
  console.log('             CAMPUSFIX TEST EXECUTION SUMMARY');
  console.log('===============================================================');

  let totalPassed = 0;
  let totalFailed = 0;
  let allSucceeded = true;

  results.forEach((r, idx) => {
    const statusMark = r.success ? '✔ PASS' : '✖ FAIL';
    console.log(`${(idx + 1).toString().padStart(2, ' ')}. [${statusMark}] ${r.name.padEnd(42, ' ')} (${r.elapsed}s) -> ${r.passedCount} passed, ${r.failedCount} failed`);
    totalPassed += r.passedCount;
    totalFailed += r.failedCount;
    if (!r.success) allSucceeded = false;
  });

  console.log('---------------------------------------------------------------');
  console.log(`Total Suites:   ${suites.length}`);
  console.log(`Total Tests:    ${totalPassed + totalFailed} (${totalPassed} Passed, ${totalFailed} Failed)`);
  console.log(`Overall Status: ${allSucceeded ? 'ALL SUITES PASSED (100%)' : 'SOME SUITES FAILED'}`);
  console.log('===============================================================\n');

  if (!allSucceeded) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runNextSuite();
