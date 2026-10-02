/**
 * CampusFix — Stage 3 Verification & Automated Test Suite
 * Validates Express server startup, HTTP security headers, CORS,
 * database connectivity, parameterized queries, and safe error handling.
 */

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { app } = require('../server');
const { closePool } = require('../config/db');

const TEST_PORT = 5055;
let server;

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          parsed = body;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=======================================================');
  console.log('STARTING STAGE 3 AUTOMATED VERIFICATION SUITE');
  console.log('=======================================================');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName}`);
      throw new Error(`Assertion failed for: ${testName}`);
    }
  }

  // 1. Start Server on TEST_PORT
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Test Setup] Test server started on port ${TEST_PORT}`);
      resolve();
    });
  });

  try {
    // Test 1: GET /api/health (Server Liveness)
    console.log('\n--- 1. Testing Server Liveness Endpoint (/api/health) ---');
    const healthRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/health',
      method: 'GET'
    });
    assert(healthRes.statusCode === 200, 'GET /api/health returns HTTP 200');
    assert(healthRes.data.success === true, 'Response envelope has success: true');
    assert(healthRes.data.data.status === 'healthy', 'Health status is "healthy"');
    assert(typeof healthRes.data.data.uptimeSeconds === 'number', 'Uptime reported as number');

    // Test 2: Security Headers (Helmet)
    console.log('\n--- 2. Testing Security Headers ---');
    assert(healthRes.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff present');
    assert(healthRes.headers['x-frame-options'] === 'DENY', 'X-Frame-Options: DENY present');
    assert(healthRes.headers['content-security-policy'] !== undefined, 'Content-Security-Policy header present');

    // Test 3: GET /api/health/db (Database Readiness & Latency)
    console.log('\n--- 3. Testing Database Health Endpoint (/api/health/db) ---');
    const dbHealthRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/health/db',
      method: 'GET'
    });
    assert(dbHealthRes.statusCode === 200, 'GET /api/health/db returns HTTP 200');
    assert(dbHealthRes.data.success === true, 'DB health response has success: true');
    assert(dbHealthRes.data.data.status === 'connected', 'Database status is "connected"');
    assert(dbHealthRes.data.data.database === 'CampusFixDB', 'Connected database is CampusFixDB');
    assert(typeof dbHealthRes.data.data.latencyMs === 'number', 'Query latency measured in ms');
    // Secret Leakage Check
    const dbPayloadStr = JSON.stringify(dbHealthRes.data);
    assert(!dbPayloadStr.includes('CampusFix@2026!Pass'), 'DB response does NOT leak password');
    assert(!dbPayloadStr.includes('campusfix_jwt_super_secret'), 'DB response does NOT leak JWT secret');

    // Test 4: GET /api/system/stats (Parameterized Query Execution)
    console.log('\n--- 4. Testing Parameterized Database Query (/api/system/stats) ---');
    const statsRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/system/stats',
      method: 'GET'
    });
    assert(statsRes.statusCode === 200, 'GET /api/system/stats returns HTTP 200');
    assert(statsRes.data.data.totalUsers >= 5, 'Verified at least 5 users in database');
    assert(statsRes.data.data.totalDepartments === 6, 'Verified 6 seeded departments');
    assert(statsRes.data.data.totalCategories === 8, 'Verified 8 seeded categories');
    assert(statsRes.data.data.totalComplaints >= 6, 'Verified at least 6 complaints in database');

    // Test 5: 404 Not Found Handling
    console.log('\n--- 5. Testing Undefined Route Handling (404) ---');
    const notFoundRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/unknown-route',
      method: 'GET'
    });
    assert(notFoundRes.statusCode === 404, 'Unknown endpoint returns HTTP 404');
    assert(notFoundRes.data.success === false, '404 response has success: false');
    assert(notFoundRes.data.error.code === 'NOT_FOUND', '404 error code is "NOT_FOUND"');

    // Test 6: Malformed JSON Handling
    console.log('\n--- 6. Testing Malformed JSON Payload Handling ---');
    const malformedRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/health',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      '{ "invalidJson: true' // Malformed JSON string
    );
    assert(malformedRes.statusCode === 400, 'Malformed JSON returns HTTP 400');
    assert(malformedRes.data.error.code === 'INVALID_JSON_PAYLOAD', 'Error code is "INVALID_JSON_PAYLOAD"');

    console.log('\n=======================================================');
    console.log(`ALL TESTS PASSED! (${passedTests}/${totalTests})`);
    console.log('=======================================================');

  } finally {
    // Teardown
    await new Promise((resolve) => server.close(resolve));
    await closePool();
    console.log('[Test Teardown] Server and database pool cleanly closed.');
  }
}

runTests().catch((err) => {
  console.error('[Test Failure]:', err.message);
  process.exit(1);
});
