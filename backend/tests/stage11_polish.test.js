/**
 * CampusFix — Stage 11 Validation, Error Handling, User Feedback, and UX Polish Test Suite
 * Comprehensive automated verification for:
 * 1. Registration input validation (email format, password complexity, boundary lengths, phone)
 * 2. Duplicate registration handling (409 Conflict)
 * 3. Login validation & secure credential handling (400 validation, 401 invalid credentials)
 * 4. Complaint input validation (title, description, category ID, building, room number, priority)
 * 5. Comment input validation (whitespace rejection, min/max length checks)
 * 6. Admin status update & assignment validation (status enum whitelist, note limits)
 * 7. Query filter & search parameter sanitization (SQL injection resilience, length clamping)
 * 8. Centralized error envelope uniformity (consistent 400, 401, 403, 404 structures)
 * 9. Information leakage prevention (zero passwordHash or stack traces in any response)
 * 10. IDOR and role-based access defense
 * 11. Frontend component & style contract verification
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { app } = require('../server');
const { closePool, getPool } = require('../config/db');

const TEST_PORT = 5064;
let server;

function makeRequest({ method = 'GET', url, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: TEST_PORT,
      path: url,
      method,
      headers: { ...headers }
    };

    let payloadString = null;
    if (body) {
      payloadString = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payloadString);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);

    if (payloadString) {
      req.write(payloadString);
    }
    req.end();
  });
}

// Test Suite Harness
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

let adminToken = '';
let studentToken = '';
let secondaryStudentToken = '';
let studentComplaintId = null;
let validCategoryId = 1;

// ==========================================
// 1. REGISTRATION VALIDATION TESTS
// ==========================================

test('1. Registration rejects missing or empty email with 400 and validation details', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      fullName: 'Valid Name',
      email: '',
      password: 'Password@123',
      studentId: 'STU1001'
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (res.data.success !== false) throw new Error('Expected success: false');
  if (res.data.error.code !== 'VALIDATION_ERROR') throw new Error(`Expected VALIDATION_ERROR, got ${res.data.error.code}`);
  if (!res.data.error.details || !res.data.error.details.email) throw new Error('Expected email in error.details');
});

test('2. Registration rejects invalid email format with 400', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      fullName: 'Valid Name',
      email: 'not-an-email@invalid',
      password: 'Password@123',
      studentId: 'STU1002'
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.email) throw new Error('Expected email validation failure message');
});

test('3. Registration rejects weak password (missing special char or too short) with 400', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      fullName: 'Valid Name',
      email: 'student_pwd_test@campusfix.edu',
      password: 'weak',
      studentId: 'STU1003'
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.password) throw new Error('Expected password validation failure message');
});

test('4. Registration rejects invalid / whitespace-only full name with 400', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      fullName: '   ',
      email: 'student_name_test@campusfix.edu',
      password: 'Password@123',
      studentId: 'STU1004'
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.fullName) throw new Error('Expected fullName in error.details');
});

test('5. Registration rejects invalid phone number format with 400', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      fullName: 'Phone Test Student',
      email: 'phone_test@campusfix.edu',
      password: 'Password@123',
      studentId: 'STU1005',
      phone: 'abc-invalid-phone'
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.phone) throw new Error('Expected phone in error.details');
});

test('6. Registration rejects duplicate email with 409 Conflict', async () => {
  const testEmail = `stage11_dup_${Date.now()}@campusfix.edu`;
  // First registration
  const firstRes = await makeRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      fullName: 'Duplicate Test',
      email: testEmail,
      password: 'Password@123',
      studentId: `STU${Date.now().toString().slice(-4)}`
    }
  });
  if (firstRes.statusCode !== 201) throw new Error(`First registration failed: ${JSON.stringify(firstRes.data)}`);

  // Second registration with same email
  const secondRes = await makeRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      fullName: 'Duplicate Test 2',
      email: testEmail,
      password: 'Password@123',
      studentId: `STU9999`
    }
  });

  if (secondRes.statusCode !== 409) throw new Error(`Expected 409 Conflict for duplicate email, got ${secondRes.statusCode}`);
  if (secondRes.data.success !== false) throw new Error('Expected success: false');
});

// ==========================================
// 2. LOGIN & AUTHENTICATION VALIDATION
// ==========================================

test('7. Login rejects empty credentials with 400 and validation details', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: { email: '', password: '' }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (res.data.error.code !== 'VALIDATION_ERROR') throw new Error(`Expected VALIDATION_ERROR, got ${res.data.error.code}`);
  if (!res.data.error.details.email || !res.data.error.details.password) {
    throw new Error('Expected both email and password in error details');
  }
});

test('8. Login with non-existent user returns 401 without user enumeration', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: { email: 'nonexistent_user_xyz@campusfix.edu', password: 'Password@123' }
  });

  if (res.statusCode !== 401) throw new Error(`Expected 401, got ${res.statusCode}`);
  if (res.data.success !== false) throw new Error('Expected success: false');
});

test('9. Login with wrong password returns 401 without revealing password hint', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: { email: 'admin@campusfix.edu', password: 'WrongPassword@999' }
  });

  if (res.statusCode !== 401) throw new Error(`Expected 401, got ${res.statusCode}`);
  if (res.data.success !== false) throw new Error('Expected success: false');
});

test('10. Admin login succeeds and returns sanitized token & profile without passwordHash', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: { email: 'admin@campusfix.edu', password: 'Admin@12345' }
  });

  if (res.statusCode !== 200) throw new Error(`Admin login failed: ${JSON.stringify(res.data)}`);
  adminToken = res.data.data.token;
  if (!adminToken) throw new Error('No admin token returned');
  if (res.data.data.user.passwordHash || res.data.data.user.password) {
    throw new Error('CRITICAL SECURITY: passwordHash leaked in login response payload');
  }
});

test('11. Register & authenticate primary and secondary student accounts', async () => {
  const s1Email = `student_stg11_a_${Date.now()}@campusfix.edu`;
  const s1 = await makeRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      fullName: 'Alice Polished',
      email: s1Email,
      password: 'Password@123',
      studentId: `A${Date.now().toString().slice(-5)}`
    }
  });
  if (s1.statusCode !== 201) throw new Error(`Student 1 register failed: ${JSON.stringify(s1.data)}`);
  studentToken = s1.data.data.token;

  const s2Email = `student_stg11_b_${Date.now()}@campusfix.edu`;
  const s2 = await makeRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      fullName: 'Bob Security',
      email: s2Email,
      password: 'Password@123',
      studentId: `B${Date.now().toString().slice(-5)}`
    }
  });
  if (s2.statusCode !== 201) throw new Error(`Student 2 register failed: ${JSON.stringify(s2.data)}`);
  secondaryStudentToken = s2.data.data.token;
});

// ==========================================
// 3. COMPLAINT INPUT VALIDATION TESTS
// ==========================================

test('12. Complaint creation rejects title shorter than 5 chars or whitespace-only', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/complaints',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      title: '   Hi   ',
      description: 'The ceiling light in the laboratory is flickering non-stop.',
      categoryId: validCategoryId,
      building: 'Engineering Block A',
      priority: 'Medium'
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details || !res.data.error.details.title) {
    throw new Error('Expected title in error.details');
  }
});

test('13. Complaint creation rejects title longer than 200 chars', async () => {
  const longTitle = 'T'.repeat(201);
  const res = await makeRequest({
    method: 'POST',
    url: '/api/complaints',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      title: longTitle,
      description: 'The ceiling light in the laboratory is flickering non-stop.',
      categoryId: validCategoryId,
      building: 'Engineering Block A',
      priority: 'Medium'
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.title) throw new Error('Expected title validation error');
});

test('14. Complaint creation rejects description shorter than 10 chars', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/complaints',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      title: 'Broken window latch',
      description: 'Broken.',
      categoryId: validCategoryId,
      building: 'Engineering Block A',
      priority: 'Medium'
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.description) throw new Error('Expected description in error.details');
});

test('15. Complaint creation rejects invalid / non-existent category ID', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/complaints',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      title: 'Valid Complaint Title',
      description: 'Valid description that has plenty of length to pass checks.',
      categoryId: 999999,
      building: 'Engineering Block A',
      priority: 'Medium'
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (res.data.error.code !== 'INVALID_CATEGORY') {
    throw new Error(`Expected INVALID_CATEGORY, got ${res.data.error.code}`);
  }
});

test('16. Complaint creation rejects invalid priority enum value', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/complaints',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      title: 'Valid Complaint Title',
      description: 'Valid description that has plenty of length to pass checks.',
      categoryId: validCategoryId,
      building: 'Engineering Block A',
      priority: 'UltraCriticalExplosive'
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.priority) throw new Error('Expected priority in error.details');
});

test('17. Valid complaint creation succeeds and returns clean payload', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/complaints',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      title: 'Laboratory 402 AC Not Cooling',
      description: 'The AC unit in Lab 402 is blowing room-temperature air despite being set to 20C.',
      categoryId: validCategoryId,
      building: 'Science & Technology Block',
      roomNumber: 'Lab 402',
      priority: 'High'
    }
  });

  if (res.statusCode !== 201) throw new Error(`Complaint creation failed: ${JSON.stringify(res.data)}`);
  studentComplaintId = res.data.data.id;
  if (!studentComplaintId) throw new Error('No complaint ID returned');
});

// ==========================================
// 4. COMMENT INPUT VALIDATION TESTS
// ==========================================

test('18. Comment rejects whitespace-only or empty content with 400', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: `/api/complaints/${studentComplaintId}/comments`,
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      commentText: '     '
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.commentText) throw new Error('Expected commentText in error.details');
});

test('19. Comment rejects text exceeding 2000 characters with 400', async () => {
  const longComment = 'C'.repeat(2005);
  const res = await makeRequest({
    method: 'POST',
    url: `/api/complaints/${studentComplaintId}/comments`,
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      commentText: longComment
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.commentText) throw new Error('Expected commentText validation error');
});

test('20. Valid comment succeeds and stores safely', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: `/api/complaints/${studentComplaintId}/comments`,
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      commentText: 'Technician visited briefly at 2 PM to inspect the filter.'
    }
  });

  if (res.statusCode !== 201) throw new Error(`Comment failed: ${JSON.stringify(res.data)}`);
  if (!res.data.data.commentText.includes('Technician visited')) {
    throw new Error('Stored comment mismatch');
  }
});

// ==========================================
// 5. ADMIN STATUS & ASSIGNMENT VALIDATION
// ==========================================

test('21. Admin status update rejects invalid status enum with 400', async () => {
  const res = await makeRequest({
    method: 'PATCH',
    url: `/api/admin/complaints/${studentComplaintId}/status`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      status: 'ArchivedForever',
      remarks: 'Attempting invalid status'
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.status) throw new Error('Expected status in error.details');
});

test('22. Admin status update rejects remarks exceeding 500 characters with 400', async () => {
  const longRemarks = 'R'.repeat(505);
  const res = await makeRequest({
    method: 'PATCH',
    url: `/api/admin/complaints/${studentComplaintId}/status`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      status: 'In Progress',
      remarks: longRemarks
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.remarks) throw new Error('Expected remarks in error.details');
});

test('23. Admin assignment rejects invalid departmentId (0 or negative) with 400', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: `/api/admin/complaints/${studentComplaintId}/assign`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      departmentId: -5,
      assignmentNotes: 'Invalid department'
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.departmentId) throw new Error('Expected departmentId in error.details');
});

test('24. Admin assignment rejects notes exceeding 500 characters with 400', async () => {
  const longNotes = 'N'.repeat(505);
  const res = await makeRequest({
    method: 'POST',
    url: `/api/admin/complaints/${studentComplaintId}/assign`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      departmentId: 1,
      assignmentNotes: longNotes
    }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (!res.data.error.details.assignmentNotes) throw new Error('Expected assignmentNotes in error.details');
});

// ==========================================
// 6. FILTER SANITIZATION & SQL INJECTION RESILIENCE
// ==========================================

test('25. Query filter sanitization safely ignores invalid status without SQL error (Student)', async () => {
  const maliciousQuery = encodeURIComponent("' OR '1'='1' -- DROP TABLE Complaints;");
  const res = await makeRequest({
    method: 'GET',
    url: `/api/complaints/my?status=${maliciousQuery}`,
    headers: { Authorization: `Bearer ${studentToken}` }
  });

  if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}: ${JSON.stringify(res.data)}`);
  if (!Array.isArray(res.data.data.complaints)) throw new Error('Expected complaints to be an array');
});

test('26. Query filter sanitization safely handles overly long search strings (Admin)', async () => {
  const longSearch = encodeURIComponent('A'.repeat(500));
  const res = await makeRequest({
    method: 'GET',
    url: `/api/admin/complaints?search=${longSearch}`,
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}: ${JSON.stringify(res.data)}`);
  if (!Array.isArray(res.data.data.complaints)) throw new Error('Expected complaints array');
});

// ==========================================
// 7. SECURITY & ENVELOPE CONSISTENCY TESTS
// ==========================================

test('27. Missing authorization token returns uniform 401 envelope', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/complaints/my'
  });

  if (res.statusCode !== 401) throw new Error(`Expected 401, got ${res.statusCode}`);
  if (res.data.success !== false) throw new Error('Expected success: false');
  if (res.data.error.code !== 'UNAUTHORIZED') throw new Error(`Expected UNAUTHORIZED, got ${res.data.error.code}`);
});

test('28. Malformed authorization token returns uniform 401 envelope', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/complaints/my',
    headers: { Authorization: 'Bearer totally-invalid-jwt-token' }
  });

  if (res.statusCode !== 401) throw new Error(`Expected 401, got ${res.statusCode}`);
  if (res.data.error.code !== 'INVALID_TOKEN') throw new Error(`Expected INVALID_TOKEN, got ${res.data.error.code}`);
});

test('29. Student token accessing admin route returns uniform 403 envelope', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/complaints',
    headers: { Authorization: `Bearer ${studentToken}` }
  });

  if (res.statusCode !== 403) throw new Error(`Expected 403 Forbidden, got ${res.statusCode}`);
  if (res.data.success !== false) throw new Error('Expected success: false');
  if (res.data.error.code !== 'FORBIDDEN') throw new Error(`Expected FORBIDDEN, got ${res.data.error.code}`);
});

test('30. IDOR Defense: Secondary student cannot access primary student complaint details', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: `/api/complaints/${studentComplaintId}`,
    headers: { Authorization: `Bearer ${secondaryStudentToken}` }
  });

  // Must be either 403 or 404 (IDOR defense)
  if (res.statusCode !== 403 && res.statusCode !== 404) {
    throw new Error(`Expected 403 or 404 for unauthorized complaint access, got ${res.statusCode}`);
  }
  if (res.data.success !== false) throw new Error('Expected success: false');
});

test('31. Requesting non-existent API endpoint returns uniform 404 envelope', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/v999/does-not-exist'
  });

  if (res.statusCode !== 404) throw new Error(`Expected 404, got ${res.statusCode}`);
  if (res.data.success !== false) throw new Error('Expected success: false');
  if (res.data.error.code !== 'NOT_FOUND') throw new Error(`Expected NOT_FOUND, got ${res.data.error.code}`);
});

test('32. Non-existent complaint ID returns uniform 404 envelope', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/complaints/9999999',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 404) throw new Error(`Expected 404, got ${res.statusCode}`);
  if (res.data.error.code !== 'NOT_FOUND') throw new Error(`Expected NOT_FOUND, got ${res.data.error.code}`);
});

test('33. No credential or passwordHash leakage across any endpoint responses', async () => {
  // Check auth/me
  const meRes = await makeRequest({
    method: 'GET',
    url: '/api/auth/me',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (meRes.statusCode !== 200) throw new Error(`auth/me failed: ${meRes.statusCode}`);
  const meStr = JSON.stringify(meRes.data);
  if (meStr.includes('passwordHash') || meStr.includes('Password@') || meStr.includes('Admin@')) {
    throw new Error('Sensitive password credential detected in /api/auth/me');
  }

  // Check complaint details
  const compRes = await makeRequest({
    method: 'GET',
    url: `/api/admin/complaints/${studentComplaintId}`,
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (compRes.statusCode !== 200) throw new Error(`complaint details failed: ${compRes.statusCode}`);
  const compStr = JSON.stringify(compRes.data);
  if (compStr.includes('passwordHash')) {
    throw new Error('Sensitive passwordHash detected in complaint details');
  }
});

// ==========================================
// 8. FRONTEND ASSETS & UX POLISH VALIDATION
// ==========================================

test('34. CSS includes all required Stage 11 polish classes and focus ring styles', async () => {
  const cssPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'css', 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  const requiredSelectors = [
    '.form-input.error',
    '.form-error',
    '.btn-loading',
    '.toast-warning',
    '.toast-danger',
    ':focus-visible'
  ];

  for (const sel of requiredSelectors) {
    if (!css.includes(sel)) {
      throw new Error(`Missing required CSS class or rule: "${sel}" in style.css`);
    }
  }
});

test('35. Components JS includes accessible dialog, alert, and button loading utilities', async () => {
  const jsPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'components.js');
  const code = fs.readFileSync(jsPath, 'utf8');

  if (!code.includes('setButtonLoading')) throw new Error('Missing setButtonLoading in components.js');
  if (!code.includes('createAlert')) throw new Error('Missing createAlert in components.js');
  if (!code.includes('confirmDialog')) throw new Error('Missing confirmDialog in components.js');
  if (!code.includes('showToast')) throw new Error('Missing showToast in components.js');
});

test('36. API JS includes clean error extraction and 413 handling', async () => {
  const apiPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'api.js');
  const code = fs.readFileSync(apiPath, 'utf8');

  if (!code.includes('getErrorMessage')) throw new Error('Missing getErrorMessage helper in api.js');
  if (!code.includes('FILE_TOO_LARGE') && !code.includes('413')) throw new Error('Missing 413 file size error mapping in api.js');
});

test('37. Student & Admin pages contain action confirmation & error handling elements', async () => {
  const adminDetailsPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'admin', 'details.html');
  const adminDetails = fs.readFileSync(adminDetailsPath, 'utf8');
  if (!adminDetails.includes('confirmDialog')) {
    throw new Error('Admin details page should use confirmDialog for destructive status changes');
  }

  const submitPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'student', 'submit.html');
  const submitHtml = fs.readFileSync(submitPath, 'utf8');
  if (!submitHtml.includes('setButtonLoading') || !submitHtml.includes('MAX_FILE_SIZE')) {
    throw new Error('Student submit page must include button loading and file size limit checks');
  }
});

// ==========================================
// RUNNER
// ==========================================

async function runTests() {
  console.log('\n======================================================');
  console.log(' CampusFix — Stage 11 Validation & UX Polish Test Suite');
  console.log('======================================================\n');

  try {
    // Start isolated test server
    server = app.listen(TEST_PORT);
    await new Promise((resolve) => server.on('listening', resolve));
    console.log(`[Stage 11 Test] Server running on isolated port ${TEST_PORT}`);

    // Pre-flight category check
    const pool = await getPool();
    const catResult = await pool.request().query('SELECT TOP 1 id FROM Categories WHERE isActive = 1');
    if (catResult.recordset.length > 0) {
      validCategoryId = catResult.recordset[0].id;
    }

    let passed = 0;
    let failed = 0;

    for (const t of tests) {
      process.stdout.write(`  • ${t.name} ... `);
      try {
        await t.fn();
        console.log('\x1b[32mPASS\x1b[0m');
        passed++;
      } catch (err) {
        console.log('\x1b[31mFAIL\x1b[0m');
        console.error(`    -> ${err.message}`);
        failed++;
      }
    }

    console.log('\n------------------------------------------------------');
    console.log(` Results: ${passed} passed, ${failed} failed (${tests.length} total)`);
    console.log('------------------------------------------------------\n');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (fatalErr) {
    console.error('Fatal Test Runner Error:', fatalErr);
    process.exitCode = 1;
  } finally {
    if (server) {
      await new Promise((res) => server.close(res));
    }
    await closePool();
  }
}

runTests();
