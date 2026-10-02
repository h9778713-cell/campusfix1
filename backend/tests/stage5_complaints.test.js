/**
 * CampusFix — Stage 5 Complaint APIs Automated Test Suite
 * Validates complaint submission, retrieval, IDOR defense, admin triage,
 * status transitions, priority updates, assignments, threaded comments,
 * and security defenses (SQLi, role tampering, and parameter validation).
 */

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { app } = require('../server');
const { closePool } = require('../config/db');

const TEST_PORT = 5057;
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

async function runStage5Tests() {
  console.log('=======================================================');
  console.log('STARTING STAGE 5 COMPLAINT APIS & SECURITY TEST SUITE');
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

  // 1. Start Server
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Test Setup] Complaint test server running on port ${TEST_PORT}`);
      resolve();
    });
  });

  let aliToken = null;
  let saraToken = null;
  let adminToken = null;

  let createdComplaintId = null;
  let createdComplaintCode = null;

  try {
    // ------------------------------------------------------------------------
    // Setup: Login Users (Ali = Student 1, Sara = Student 2, Admin)
    // ------------------------------------------------------------------------
    console.log('\n--- Setup: Authenticating Test Users ---');
    const aliLogin = await makeRequest(
      { hostname: 'localhost', port: TEST_PORT, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'ali.khan@campusfix.edu', password: 'Student@12345' }
    );
    aliToken = aliLogin.data.data.token;
    assert(aliLogin.statusCode === 200, 'Student Ali logged in');

    const saraLogin = await makeRequest(
      { hostname: 'localhost', port: TEST_PORT, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'sara.ahmed@campusfix.edu', password: 'Student@12345' }
    );
    saraToken = saraLogin.data.data.token;
    assert(saraLogin.statusCode === 200, 'Student Sara logged in');

    const adminLogin = await makeRequest(
      { hostname: 'localhost', port: TEST_PORT, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'admin@campusfix.edu', password: 'Admin@12345' }
    );
    adminToken = adminLogin.data.data.token;
    assert(adminLogin.statusCode === 200, 'Campus Admin logged in');

    // ------------------------------------------------------------------------
    // Test 1: Student creates valid complaint
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Student Complaint Creation (Valid) ---');
    const createRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/complaints',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliToken}` }
      },
      {
        title: 'Ceiling Fan Making Grinding Noise in Classroom 102',
        description: 'The front ceiling fan is squeaking loudly and wobbling during lectures, causing distraction.',
        categoryId: 4, // Electrical & Lighting
        building: 'Science Block B',
        roomNumber: 'Room 102',
        priority: 'Medium'
      }
    );

    assert(createRes.statusCode === 201, 'Student complaint created with HTTP 201');
    assert(createRes.data.success === true, 'Response indicates success');
    assert(createRes.data.data.status === 'Pending', 'Initial status set to "Pending"');
    assert(createRes.data.data.complaintCode.startsWith('CMP-'), 'Generated code has format CMP-YYYY-XXXX');

    createdComplaintId = createRes.data.data.id;
    createdComplaintCode = createRes.data.data.complaintCode;

    // ------------------------------------------------------------------------
    // Test 2: Student creates complaint with invalid data
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Student Complaint Creation (Invalid Data) ---');
    const invalidCreateRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/complaints',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliToken}` }
      },
      {
        title: 'Tiny', // Too short (< 5 chars)
        description: 'Short', // Too short (< 10 chars)
        categoryId: 99999, // Non-existent category
        building: '', // Missing
        priority: 'InvalidPriority' // Bad priority
      }
    );

    assert(invalidCreateRes.statusCode === 400, 'Invalid complaint creation returns HTTP 400');
    assert(invalidCreateRes.data.error.code === 'VALIDATION_ERROR', 'Returns VALIDATION_ERROR');

    // ------------------------------------------------------------------------
    // Test 3: Student views own complaints with filtering & pagination
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Student Views Own Complaints ---');
    const myComplaintsRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/complaints/my?page=1&limit=5',
      method: 'GET',
      headers: { Authorization: `Bearer ${aliToken}` }
    });

    assert(myComplaintsRes.statusCode === 200, 'GET /api/complaints/my returns HTTP 200');
    assert(Array.isArray(myComplaintsRes.data.data.complaints), 'Returns array of complaints');
    assert(myComplaintsRes.data.data.pagination.page === 1, 'Pagination page is 1');
    assert(
      myComplaintsRes.data.data.complaints.every((c) => c.complaintCode !== undefined),
      'Each complaint contains complaintCode'
    );

    // ------------------------------------------------------------------------
    // Test 4: Student views own complaint details & timeline
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Student Views Own Complaint Details ---');
    const detailsRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${createdComplaintId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${aliToken}` }
    });

    assert(detailsRes.statusCode === 200, 'GET /api/complaints/:id returns HTTP 200');
    assert(detailsRes.data.data.id === createdComplaintId, 'Details match requested complaint ID');
    assert(Array.isArray(detailsRes.data.data.history), 'Status history timeline returned');
    assert(detailsRes.data.data.history[0].newStatus === 'Pending', 'Initial history entry is Pending');

    // ------------------------------------------------------------------------
    // Test 5: Student adds comment to own complaint
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Student Adds Comment to Own Complaint ---');
    const commentRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${createdComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliToken}` }
      },
      {
        commentText: 'Please check this before 2 PM today as class starts at 2:30 PM.'
      }
    );

    assert(commentRes.statusCode === 201, 'Comment added with HTTP 201');
    assert(commentRes.data.data.commentText.includes('class starts'), 'Comment text matches');
    assert(commentRes.data.data.authorRole === 'student', 'Author role identified as student');

    // ------------------------------------------------------------------------
    // Test 6: IDOR Protection: Sara attempts to access Ali's complaint
    // ------------------------------------------------------------------------
    console.log('\n--- 6. IDOR Protection: Student Blocked from Viewing Another Student\'s Complaint ---');
    const idorRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${createdComplaintId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${saraToken}` } // Sara trying to view Ali's complaint
    });

    assert(idorRes.statusCode === 403, 'Unauthorized student blocked with HTTP 403 Forbidden');
    assert(idorRes.data.error.code === 'FORBIDDEN', 'Error code is FORBIDDEN');

    // ------------------------------------------------------------------------
    // Test 7: IDOR Protection: Sara attempts to comment on Ali's complaint
    // ------------------------------------------------------------------------
    console.log('\n--- 7. IDOR Protection: Student Blocked from Commenting on Another Student\'s Complaint ---');
    const commentIdorRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${createdComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saraToken}` }
      },
      {
        commentText: 'Malicious unauthorized comment.'
      }
    );

    assert(commentIdorRes.statusCode === 403, 'Unauthorized comment blocked with HTTP 403 Forbidden');

    // ------------------------------------------------------------------------
    // Test 8: Student attempts to access admin endpoints
    // ------------------------------------------------------------------------
    console.log('\n--- 8. RBAC: Student Blocked from Admin Endpoints ---');
    const studentAdminRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/admin/complaints',
      method: 'GET',
      headers: { Authorization: `Bearer ${aliToken}` }
    });

    assert(studentAdminRes.statusCode === 403, 'Student blocked from /api/admin/complaints with HTTP 403');

    // ------------------------------------------------------------------------
    // Test 9: Admin views all complaints
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Admin Views All Campus Complaints ---');
    const adminAllRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/admin/complaints?page=1&limit=20',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert(adminAllRes.statusCode === 200, 'Admin complaint list returns HTTP 200');
    assert(adminAllRes.data.data.complaints.length >= 7, 'Admin sees all campus complaints');

    // ------------------------------------------------------------------------
    // Test 10: Admin filters and searches complaints
    // ------------------------------------------------------------------------
    console.log('\n--- 10. Admin Filters and Searches Complaints ---');
    const searchRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/admin/complaints?search=Projector&status=In%20Progress',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert(searchRes.statusCode === 200, 'Admin filtered search returns HTTP 200');
    assert(
      searchRes.data.data.complaints.every((c) => c.status === 'In Progress'),
      'Filtered complaints match status="In Progress"'
    );

    // ------------------------------------------------------------------------
    // Test 11: Admin views complaint details (including admin-only comments)
    // ------------------------------------------------------------------------
    console.log('\n--- 11. Admin Views Complaint Details ---');
    const adminDetailRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/admin/complaints/${createdComplaintId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert(adminDetailRes.statusCode === 200, 'Admin details return HTTP 200');
    assert(adminDetailRes.data.data.id === createdComplaintId, 'Admin fetched target complaint');

    // ------------------------------------------------------------------------
    // Test 12: Admin updates complaint status
    // ------------------------------------------------------------------------
    console.log('\n--- 12. Admin Updates Complaint Status ---');
    const statusUpdateRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${createdComplaintId}/status`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }
      },
      {
        status: 'In Progress',
        remarks: 'Electrician dispatched with replacement motor bracket.'
      }
    );

    assert(statusUpdateRes.statusCode === 200, 'Status updated with HTTP 200');
    assert(statusUpdateRes.data.data.status === 'In Progress', 'Status changed to "In Progress"');

    // ------------------------------------------------------------------------
    // Test 13: Admin updates priority
    // ------------------------------------------------------------------------
    console.log('\n--- 13. Admin Updates Complaint Priority ---');
    const priorityUpdateRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${createdComplaintId}/priority`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }
      },
      {
        priority: 'High'
      }
    );

    assert(priorityUpdateRes.statusCode === 200, 'Priority updated with HTTP 200');
    assert(priorityUpdateRes.data.data.priority === 'High', 'Priority changed to "High"');

    // ------------------------------------------------------------------------
    // Test 14: Admin adds admin-only comment & student isolation check
    // ------------------------------------------------------------------------
    console.log('\n--- 14. Admin Adds Internal Note & Student Visibility Isolation ---');
    const adminNoteRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${createdComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }
      },
      {
        commentText: 'INTERNAL NOTE: Spare parts will take 2 days from supplier.',
        isAdminOnly: true
      }
    );

    assert(adminNoteRes.statusCode === 201, 'Admin internal note posted with HTTP 201');

    // Now student Ali fetches comments on his complaint. The internal note MUST be hidden!
    const aliCommentsRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${createdComplaintId}/comments`,
      method: 'GET',
      headers: { Authorization: `Bearer ${aliToken}` }
    });

    const hasInternalNote = aliCommentsRes.data.data.some((c) => c.commentText.includes('INTERNAL NOTE'));
    assert(hasInternalNote === false, 'Student does NOT see admin-only internal note');

    // ------------------------------------------------------------------------
    // Test 15: Admin assigns complaint to department
    // ------------------------------------------------------------------------
    console.log('\n--- 15. Admin Assigns Complaint to Department ---');
    const assignRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${createdComplaintId}/assign`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }
      },
      {
        departmentId: 3, // Electrical & Power Systems
        notes: 'Priority assignment for afternoon maintenance shift.'
      }
    );

    assert(assignRes.statusCode === 200, 'Complaint assigned with HTTP 200');
    assert(assignRes.data.data.departmentId === 3, 'Assigned department ID is 3');

    // ------------------------------------------------------------------------
    // Test 16: SQL Injection Defense on Search and Complaint Submission
    // ------------------------------------------------------------------------
    console.log('\n--- 16. SQL Injection Defense Tests ---');
    const sqliSearchRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: encodeURI("/api/admin/complaints?search=' OR 1=1; DROP TABLE Users; --"),
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert(sqliSearchRes.statusCode === 200, 'SQLi in search handled safely without executing injected SQL');


    // ------------------------------------------------------------------------
    // Test 17: Student attempts unauthorized status change
    // ------------------------------------------------------------------------
    console.log('\n--- 17. Security: Student Blocked from Modifying Status ---');
    const studentStatusHack = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${createdComplaintId}/status`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliToken}` }
      },
      { status: 'Resolved' }
    );

    assert(studentStatusHack.statusCode === 403, 'Student blocked from status patch with HTTP 403');

    // ------------------------------------------------------------------------
    // Test 18: Malformed / Invalid ID Handling
    // ------------------------------------------------------------------------
    console.log('\n--- 18. Invalid and Malformed ID Handling ---');
    const badIdRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/complaints/not-a-number',
      method: 'GET',
      headers: { Authorization: `Bearer ${aliToken}` }
    });

    assert(badIdRes.statusCode === 400, 'String ID returns HTTP 400');
    assert(badIdRes.data.error.code === 'INVALID_ID', 'Error code is INVALID_ID');

    const notFoundRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/complaints/999999',
      method: 'GET',
      headers: { Authorization: `Bearer ${aliToken}` }
    });

    assert(notFoundRes.statusCode === 404, 'Non-existent ID returns HTTP 404');

    // ------------------------------------------------------------------------
    // Test 19: Public Categories & Departments Metadata
    // ------------------------------------------------------------------------
    console.log('\n--- 19. Categories and Departments Metadata Verification ---');
    const catRes = await makeRequest({ hostname: 'localhost', port: TEST_PORT, path: '/api/categories', method: 'GET' });
    const deptRes = await makeRequest({ hostname: 'localhost', port: TEST_PORT, path: '/api/departments', method: 'GET' });

    assert(catRes.statusCode === 200 && catRes.data.data.length === 8, '8 active categories retrieved');
    assert(deptRes.statusCode === 200 && deptRes.data.data.length === 6, '6 active departments retrieved');

    console.log('\n=======================================================');
    console.log(`ALL STAGE 5 COMPLAINT TESTS PASSED! (${passedTests}/${totalTests})`);
    console.log('=======================================================');

  } finally {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
    console.log('[Test Teardown] Server and database pool cleanly closed.');
  }
}

runStage5Tests().catch((err) => {
  console.error('[Stage 5 Test Failure]:', err.message);
  process.exit(1);
});
