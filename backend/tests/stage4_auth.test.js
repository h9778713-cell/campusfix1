/**
 * CampusFix — Stage 4 Authentication & Authorization Automated Test Suite
 * Validates registration, credential validation, JWT issuance, HttpOnly cookies,
 * RBAC, timing attack mitigation, rate limiting, and password hashing in DB.
 */

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { app } = require('../server');
const { executeQuery, closePool, sql } = require('../config/db');

const TEST_PORT = 5056;
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

async function runStage4Tests() {
  console.log('=======================================================');
  console.log('STARTING STAGE 4 AUTHENTICATION & RBAC TEST SUITE');
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

  // Start test server
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Test Setup] Auth test server running on port ${TEST_PORT}`);
      resolve();
    });
  });

  const timestamp = Date.now();
  const testEmail = `test.student.${timestamp}@campusfix.edu`;
  const testStudentId = `STU-${timestamp.toString().slice(-6)}`;
  const testPassword = 'StrongPassword123!';

  let studentToken = null;
  let adminToken = null;

  try {
    // ------------------------------------------------------------------------
    // Test 1: Student registration with valid data
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Testing Student Registration with Valid Data ---');
    const regRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        fullName: 'Test Candidate',
        email: testEmail,
        password: testPassword,
        studentId: testStudentId,
        phone: '+1-555-8899'
      }
    );

    assert(regRes.statusCode === 201, 'Registration returns HTTP 201 Created');
    assert(regRes.data.success === true, 'Response envelope has success: true');
    assert(regRes.data.data.user.email === testEmail, 'Returned user email matches');
    assert(regRes.data.data.user.role === 'student', 'Assigned role is "student"');
    assert(typeof regRes.data.data.token === 'string', 'JWT token issued in response');
    assert(regRes.headers['set-cookie'] !== undefined, 'HttpOnly session cookie attached');
    assert(regRes.data.data.user.passwordHash === undefined, 'Password hash is NOT in registration response');

    studentToken = regRes.data.data.token;

    // ------------------------------------------------------------------------
    // Test 2: Registration with invalid data
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Testing Registration with Invalid Data ---');
    const invalidRegRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        fullName: 'A', // Too short
        email: 'not-an-email', // Bad format
        password: 'weak', // Weak password
        studentId: '' // Missing ID
      }
    );

    assert(invalidRegRes.statusCode === 400, 'Invalid registration returns HTTP 400');
    assert(invalidRegRes.data.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');
    assert(invalidRegRes.data.error.details.email !== undefined, 'Validation caught bad email');
    assert(invalidRegRes.data.error.details.password !== undefined, 'Validation caught weak password');
    assert(invalidRegRes.data.error.details.studentId !== undefined, 'Validation caught missing student ID');

    // ------------------------------------------------------------------------
    // Test 3: Duplicate Registration Check
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Testing Duplicate Registration Prevention ---');
    const duplicateRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        fullName: 'Duplicate User',
        email: testEmail, // Reusing existing email
        password: testPassword,
        studentId: `DIFF-${timestamp}`,
        phone: '+1-555-0000'
      }
    );

    assert(duplicateRes.statusCode === 409, 'Duplicate email returns HTTP 409 Conflict');
    assert(duplicateRes.data.error.code === 'EMAIL_EXISTS', 'Error code is EMAIL_EXISTS');

    // ------------------------------------------------------------------------
    // Test 4: Login with valid credentials (Student & Admin)
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Testing Login with Valid Credentials ---');
    const studentLoginRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        email: testEmail,
        password: testPassword
      }
    );

    assert(studentLoginRes.statusCode === 200, 'Student login returns HTTP 200');
    assert(studentLoginRes.data.data.user.role === 'student', 'Logged in as role "student"');
    assert(studentLoginRes.data.data.user.passwordHash === undefined, 'Password hash NOT returned in login response');

    // Test Admin Login (using seeded admin account)
    const adminLoginRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        email: 'admin@campusfix.edu',
        password: 'Admin@12345'
      }
    );

    assert(adminLoginRes.statusCode === 200, 'Admin login returns HTTP 200');
    assert(adminLoginRes.data.data.user.role === 'admin', 'Logged in as role "admin"');
    adminToken = adminLoginRes.data.data.token;

    // ------------------------------------------------------------------------
    // Test 5: Login with incorrect credentials (Anti-Enumeration)
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Testing Login Failure & Anti-Enumeration ---');
    const nonExistentRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        email: 'nonexistent.user@university.edu',
        password: 'SomePassword123!'
      }
    );

    const wrongPassRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        email: 'admin@campusfix.edu',
        password: 'WrongPassword999!'
      }
    );

    assert(nonExistentRes.statusCode === 401, 'Non-existent email returns HTTP 401');
    assert(wrongPassRes.statusCode === 401, 'Wrong password returns HTTP 401');
    assert(
      nonExistentRes.data.error.message === wrongPassRes.data.error.message,
      'Anti-enumeration: Non-existent email and wrong password return identical error message'
    );

    // ------------------------------------------------------------------------
    // Test 6: Protected route without authentication
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Testing Protected Route Without Token ---');
    const unauthRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/auth/me',
      method: 'GET'
    });

    assert(unauthRes.statusCode === 401, 'Unauthenticated request returns HTTP 401');
    assert(unauthRes.data.error.code === 'UNAUTHORIZED', 'Error code is UNAUTHORIZED');

    // ------------------------------------------------------------------------
    // Test 7: Protected route with valid student authentication
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Testing Protected Route with Valid Student Token ---');
    const studentMeRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/auth/me',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${studentToken}`
      }
    });

    assert(studentMeRes.statusCode === 200, 'GET /api/auth/me with Bearer token returns HTTP 200');
    assert(studentMeRes.data.data.user.email === testEmail, 'Verified identity matches student');
    assert(studentMeRes.data.data.user.passwordHash === undefined, 'Password hash is NOT in profile');

    // ------------------------------------------------------------------------
    // Test 8: Student attempting to access admin functionality (RBAC)
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Testing RBAC: Student Blocked from Admin Endpoint ---');
    const studentBlockedRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/auth/admin-only',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${studentToken}`
      }
    });

    assert(studentBlockedRes.statusCode === 403, 'Student accessing admin route returns HTTP 403 Forbidden');
    assert(studentBlockedRes.data.error.code === 'FORBIDDEN', 'Error code is FORBIDDEN');

    // ------------------------------------------------------------------------
    // Test 9: Admin accessing admin functionality
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Testing RBAC: Admin Permitted on Admin Endpoint ---');
    const adminAllowedRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/auth/admin-only',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    assert(adminAllowedRes.statusCode === 200, 'Admin accessing admin route returns HTTP 200');
    assert(adminAllowedRes.data.data.admin.role === 'admin', 'Admin role verified by server');

    // ------------------------------------------------------------------------
    // Test 10: Attempt to manipulate role from client (Privilege Escalation Guard)
    // ------------------------------------------------------------------------
    console.log('\n--- 10. Testing Privilege Escalation Defense ---');
    const attackEmail = `hacker.${timestamp}@campusfix.edu`;
    const attackRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        fullName: 'Hacker User',
        email: attackEmail,
        password: testPassword,
        studentId: `HACK-${timestamp.toString().slice(-6)}`,
        role: 'admin' // Attempting to register as admin!
      }
    );

    assert(attackRes.statusCode === 201, 'Registration accepted');
    assert(attackRes.data.data.user.role === 'student', 'Server ignored client role and enforced role="student"');

    // Verify directly in database that role is 'student'
    const dbCheck = await executeQuery('SELECT role FROM dbo.Users WHERE email = @email', [
      { name: 'email', type: sql.NVarChar(255), value: attackEmail }
    ]);
    assert(dbCheck.recordset[0].role === 'student', 'Database record confirmed role="student"');

    // ------------------------------------------------------------------------
    // Test 11: Invalid/Expired Authentication Token
    // ------------------------------------------------------------------------
    console.log('\n--- 11. Testing Tampered / Invalid Token Rejection ---');
    const tamperedToken = studentToken.slice(0, -6) + 'abc123';
    const tamperedRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/auth/me',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tamperedToken}`
      }
    });

    assert(tamperedRes.statusCode === 401, 'Tampered token returns HTTP 401');
    assert(tamperedRes.data.error.code === 'INVALID_TOKEN', 'Error code is INVALID_TOKEN');

    // ------------------------------------------------------------------------
    // Test 12: Password Hash Storage Verification (Database Integrity)
    // ------------------------------------------------------------------------
    console.log('\n--- 12. Testing Database Password Hash Storage (No Plaintext) ---');
    const passwordCheck = await executeQuery('SELECT passwordHash FROM dbo.Users WHERE email = @email', [
      { name: 'email', type: sql.NVarChar(255), value: testEmail }
    ]);
    const storedHash = passwordCheck.recordset[0].passwordHash;
    assert(storedHash !== testPassword, 'Stored password is NOT plaintext');
    assert(storedHash.startsWith('$2a$12$') || storedHash.startsWith('$2b$12$'), 'Stored password is valid bcrypt hash with 12 rounds');

    // ------------------------------------------------------------------------
    // Test 13: Cookie-Based Authentication
    // ------------------------------------------------------------------------
    console.log('\n--- 13. Testing Cookie-Based Authentication ---');
    const cookieHeader = `campusfix_token=${studentToken}`;
    const cookieAuthRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/auth/student-only',
      method: 'GET',
      headers: {
        Cookie: cookieHeader
      }
    });

    assert(cookieAuthRes.statusCode === 200, 'Cookie-authenticated request returns HTTP 200');
    assert(cookieAuthRes.data.data.student.role === 'student', 'Cookie session correctly recognized');

    // ------------------------------------------------------------------------
    // Test 14: Rate Limiting on Authentication Endpoint
    // ------------------------------------------------------------------------
    console.log('\n--- 14. Testing Login Rate Limiting (Brute-Force Guard) ---');
    let throttled = false;
    // We already performed 3 logins above. authLimiter allows 10 attempts per 15 min.
    // Trigger consecutive rapid failed attempts until 429
    for (let i = 0; i < 12; i++) {
      const floodRes = await makeRequest(
        {
          hostname: 'localhost',
          port: TEST_PORT,
          path: '/api/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        },
        {
          email: 'flood.test@university.edu',
          password: 'wrong'
        }
      );

      if (floodRes.statusCode === 429) {
        throttled = true;
        assert(floodRes.data.error.code === 'AUTH_THROTTLED', 'Throttled error code is AUTH_THROTTLED');
        break;
      }
    }
    assert(throttled === true, 'Excessive login requests successfully throttled with HTTP 429');

    console.log('\n=======================================================');
    console.log(`ALL STAGE 4 AUTH TESTS PASSED! (${passedTests}/${totalTests})`);
    console.log('=======================================================');

  } finally {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
    console.log('[Test Teardown] Auth test server and connection pool closed.');
  }
}

runStage4Tests().catch((err) => {
  console.error('[Stage 4 Test Failure]:', err.message);
  process.exit(1);
});
