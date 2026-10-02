/**
 * CampusFix — Stage 6 Comments, Status History, & Assignments Automated Test Suite
 * Validates threaded comments, author roles, internal notes privacy,
 * IDOR defenses, status audit timelines, redundant transition prevention,
 * admin department & staff assignments, assignee role enforcement,
 * assignment history tracking, and SQL injection defenses.
 */

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { app } = require('../server');
const { closePool } = require('../config/db');

const TEST_PORT = 5058;
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

async function runStage6Tests() {
  console.log('================================================================');
  console.log('STARTING STAGE 6: COMMENTS, STATUS HISTORY, & ASSIGNMENTS SUITE');
  console.log('================================================================');

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

  // 1. Start Server on isolated port
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Test Setup] Stage 6 test server running on port ${TEST_PORT}`);
      resolve();
    });
  });

  let aliToken = null;
  let aliUserId = null;
  let saraToken = null;
  let saraUserId = null;
  let adminToken = null;
  let adminUserId = null;
  let adminFullName = null;

  let testComplaintId = null;
  let testComplaintCode = null;

  try {
    // ------------------------------------------------------------------------
    // Setup: Authenticate Test Users
    // ------------------------------------------------------------------------
    console.log('\n--- Setup: Authenticating Users ---');

    // 1. Student Ali
    const aliRes = await makeRequest(
      { hostname: 'localhost', port: TEST_PORT, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'ali.khan@campusfix.edu', password: 'Student@12345' }
    );
    aliToken = aliRes.data.data.token;
    aliUserId = aliRes.data.data.user.id;
    assert(aliRes.statusCode === 200 && aliToken, '1. Student Ali authenticated');

    // 2. Student Sara
    const saraRes = await makeRequest(
      { hostname: 'localhost', port: TEST_PORT, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'sara.ahmed@campusfix.edu', password: 'Student@12345' }
    );
    saraToken = saraRes.data.data.token;
    saraUserId = saraRes.data.data.user.id;
    assert(saraRes.statusCode === 200 && saraToken, '2. Student Sara authenticated');

    // 3. Admin
    const adminRes = await makeRequest(
      { hostname: 'localhost', port: TEST_PORT, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'admin@campusfix.edu', password: 'Admin@12345' }
    );
    adminToken = adminRes.data.data.token;
    adminUserId = adminRes.data.data.user.id;
    adminFullName = adminRes.data.data.user.fullName;
    assert(adminRes.statusCode === 200 && adminToken, '3. Admin authenticated');

    // 4. Ali submits a new complaint
    console.log('\n--- Setup: Ali creates test complaint ---');
    const createRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/complaints',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliToken}`
        }
      },
      {
        title: 'Broken AC unit in Science Block Lab 4',
        description: 'The air conditioner is leaking water and making a loud humming noise.',
        categoryId: 1, // Electrical & Appliances
        building: 'Science Block',
        roomNumber: 'Lab 4',
        priority: 'High'
      }
    );
    testComplaintId = createRes.data.data.id;
    testComplaintCode = createRes.data.data.complaintCode;
    assert(createRes.statusCode === 201 && testComplaintId > 0, `4. Test complaint created: ${testComplaintCode} (ID: ${testComplaintId})`);

    // ------------------------------------------------------------------------
    // Feature 1: Status History & Audit Log
    // ------------------------------------------------------------------------
    console.log('\n--- Feature 1: Status History Verification ---');

    // 5. Initial status history record created automatically
    const historyRes1 = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${testComplaintId}/history`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliToken}` }
    });
    assert(historyRes1.statusCode === 200 && Array.isArray(historyRes1.data.data), '5. Status history endpoint returns array');
    assert(
      historyRes1.data.data.length === 1 &&
      historyRes1.data.data[0].newStatus === 'Pending' &&
      historyRes1.data.data[0].oldStatus === null &&
      historyRes1.data.data[0].changedByRole === 'student',
      '6. Initial status history record verified (newStatus=Pending, oldStatus=null, role=student)'
    );

    // 6. Direct status history tampering blocked (no PUT/POST on history route)
    const directTamperRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${testComplaintId}/history`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliToken}` }
      },
      { status: 'Resolved' }
    );
    assert(directTamperRes.statusCode === 404 || directTamperRes.statusCode === 405, '7. Direct POST to status history is blocked (immutable audit trail)');

    // 7. Student cannot change complaint status (Admin only)
    const studentStatusChangeRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${testComplaintId}/status`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliToken}` }
      },
      { status: 'Resolved', remarks: 'Trying to self-resolve' }
    );
    assert(studentStatusChangeRes.statusCode === 403, '8. Student blocked from updating status (HTTP 403 Forbidden)');

    // 8. Admin cannot update to invalid status
    const invalidStatusRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${testComplaintId}/status`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
      },
      { status: 'Completed', remarks: 'Invalid status string' }
    );
    assert(invalidStatusRes.statusCode === 400 && invalidStatusRes.data?.error?.code === 'VALIDATION_ERROR', '9. Rejects invalid status string (HTTP 400 VALIDATION_ERROR)');

    // 9. Admin cannot update to identical status (Redundant update prevention)
    const redundantStatusRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${testComplaintId}/status`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
      },
      { status: 'Pending', remarks: 'Complaint is already pending' }
    );
    assert(redundantStatusRes.statusCode === 400 && redundantStatusRes.data?.error?.code === 'STATUS_UNCHANGED', '10. Rejects redundant status update (HTTP 400 STATUS_UNCHANGED)');

    // 10. Admin updates status to 'In Progress'
    const statusInProgressRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${testComplaintId}/status`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
      },
      { status: 'In Progress', remarks: 'Assigned inspection team.' }
    );
    assert(statusInProgressRes.statusCode === 200 && statusInProgressRes.data.data.status === 'In Progress', '11. Admin advances status to "In Progress"');

    // 11. Admin updates status to 'Resolved'
    const statusResolvedRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${testComplaintId}/status`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
      },
      { status: 'Resolved', remarks: 'Replaced faulty AC capacitor.' }
    );
    assert(statusResolvedRes.statusCode === 200 && statusResolvedRes.data.data.status === 'Resolved', '12. Admin advances status to "Resolved"');
    assert(statusResolvedRes.data.data.resolvedAt !== null, '13. resolvedAt timestamp is recorded');

    // 12. Admin updates status to 'Closed'
    const statusClosedRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${testComplaintId}/status`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
      },
      { status: 'Closed', remarks: 'Case verified and closed.' }
    );
    assert(statusClosedRes.statusCode === 200 && statusClosedRes.data.data.status === 'Closed', '14. Admin advances status to "Closed"');
    assert(statusClosedRes.data.data.closedAt !== null, '15. closedAt timestamp is recorded');

    // 13. Verify full status history timeline (4 transitions total)
    const historyRes2 = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${testComplaintId}/history`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliToken}` }
    });
    assert(historyRes2.statusCode === 200 && historyRes2.data.data.length === 4, '16. History timeline has 4 chronological entries');
    const steps = historyRes2.data.data.map(h => `${h.oldStatus || 'START'}->${h.newStatus}`);
    assert(
      JSON.stringify(steps) === JSON.stringify(['START->Pending', 'Pending->In Progress', 'In Progress->Resolved', 'Resolved->Closed']),
      '17. Full audit trail verified: START->Pending -> In Progress -> Resolved -> Closed'
    );

    // 14. Admin can also access history via admin endpoint
    const adminHistoryRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/admin/complaints/${testComplaintId}/history`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(adminHistoryRes.statusCode === 200 && adminHistoryRes.data.data.length === 4, '18. Admin accesses history via /api/admin/complaints/:id/history');

    // 15. Student Sara cannot view Ali\'s complaint history (IDOR defense)
    const saraHistoryRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${testComplaintId}/history`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${saraToken}` }
    });
    assert(saraHistoryRes.statusCode === 403, '19. Student Sara blocked from viewing Ali\'s status history (IDOR HTTP 403)');

    // ------------------------------------------------------------------------
    // Feature 2: Complaint Comments
    // ------------------------------------------------------------------------
    console.log('\n--- Feature 2: Comments & Privacy Verification ---');

    // 16. Comment Validation: Reject empty comment
    const emptyCommentRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${testComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliToken}` }
      },
      { commentText: '' }
    );
    assert(emptyCommentRes.statusCode === 400, '20. Rejects empty commentText (HTTP 400)');

    // 17. Comment Validation: Reject whitespace-only comment
    const wsCommentRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${testComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliToken}` }
      },
      { commentText: '     ' }
    );
    assert(wsCommentRes.statusCode === 400, '21. Rejects whitespace-only comment (HTTP 400)');

    // 18. Comment Validation: Reject too short (<2 chars)
    const shortCommentRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${testComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliToken}` }
      },
      { commentText: 'x' }
    );
    assert(shortCommentRes.statusCode === 400, '22. Rejects single-character comment (HTTP 400)');

    // 19. Comment Validation: Reject excessively long (>2000 chars)
    const longCommentRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${testComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliToken}` }
      },
      { commentText: 'A'.repeat(2001) }
    );
    assert(longCommentRes.statusCode === 400, '23. Rejects comment > 2000 characters (HTTP 400)');

    // 20. Student Ali posts a valid comment on his own complaint
    const aliCommentRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${testComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliToken}` }
      },
      { commentText: 'Water is starting to pool near the electrical socket. Please hurry.' }
    );
    assert(aliCommentRes.statusCode === 201 && aliCommentRes.data.data.id > 0, '24. Student Ali successfully posted a comment (HTTP 201)');
    assert(aliCommentRes.data.data.authorName === 'Ali Khan' && aliCommentRes.data.data.authorRole === 'student', '25. Comment authorName and authorRole populated');

    // 21. Admin posts a public comment on Ali\'s complaint
    const adminPublicCommentRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${testComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
      },
      { commentText: 'Maintenance electrician has been dispatched to Lab 4.', isAdminOnly: false }
    );
    assert(adminPublicCommentRes.statusCode === 201, '26. Admin posted public comment (HTTP 201)');
    assert(adminPublicCommentRes.data.data.isAdminOnly === false, '27. Public comment has isAdminOnly: false');

    // 22. Admin posts an internal note (isAdminOnly: true)
    const adminPrivateCommentRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${testComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
      },
      { commentText: 'Internal note: Replaced switchboard breaker in panel 2.', isAdminOnly: true }
    );
    assert(adminPrivateCommentRes.statusCode === 201, '28. Admin posted internal note (HTTP 201)');
    assert(adminPrivateCommentRes.data.data.isAdminOnly === true, '29. Internal note has isAdminOnly: true');

    // 23. Student Ali tries to post an internal note -> sanitized to isAdminOnly = false
    const aliAttemptInternalRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${testComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliToken}` }
      },
      { commentText: 'Can I make this internal? No I cannot.', isAdminOnly: true }
    );
    assert(aliAttemptInternalRes.statusCode === 201, '30. Ali comment saved');
    assert(aliAttemptInternalRes.data.data.isAdminOnly === false, '31. Student cannot set isAdminOnly (forced false)');

    // 24. Privacy Check: Ali views comments (sees 3 comments, internal note hidden)
    const aliCommentsView = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${testComplaintId}/comments`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliToken}` }
    });
    assert(aliCommentsView.statusCode === 200, '32. Ali retrieved comments');
    assert(aliCommentsView.data.data.length === 3, '33. Ali sees only public comments (3 total)');
    const anyHidden = aliCommentsView.data.data.some(c => c.isAdminOnly === true);
    assert(!anyHidden, '34. Admin-only note is completely absent from student view');

    // 25. Privacy Check: Admin views comments (sees all 4 comments including internal note)
    const adminCommentsView = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${testComplaintId}/comments`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(adminCommentsView.statusCode === 200, '35. Admin retrieved comments');
    assert(adminCommentsView.data.data.length === 4, '36. Admin sees all 4 comments including internal notes');
    const hasInternal = adminCommentsView.data.data.some(c => c.isAdminOnly === true);
    assert(hasInternal, '37. Admin sees internal note with isAdminOnly: true');

    // 26. IDOR Check: Sara cannot comment on Ali\'s complaint
    const saraCommentAttempt = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${testComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${saraToken}` }
      },
      { commentText: 'Trying to intrude on Ali\'s complaint.' }
    );
    assert(saraCommentAttempt.statusCode === 403, '38. Sara blocked from commenting on Ali\'s complaint (IDOR HTTP 403)');

    // 27. IDOR Check: Sara cannot view comments on Ali\'s complaint
    const saraViewCommentsAttempt = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${testComplaintId}/comments`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${saraToken}` }
    });
    assert(saraViewCommentsAttempt.statusCode === 403, '39. Sara blocked from reading comments on Ali\'s complaint (IDOR HTTP 403)');

    // ------------------------------------------------------------------------
    // Feature 3: Complaint Assignments & History
    // ------------------------------------------------------------------------
    console.log('\n--- Feature 3: Department Assignments & Staff Tracking ---');

    // Fetch active departments dynamically
    const deptsRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/departments',
      method: 'GET'
    });
    assert(deptsRes.statusCode === 200 && deptsRes.data.data.length >= 2, 'Available departments retrieved');
    const firstDept = deptsRes.data.data[0];
    const secondDept = deptsRes.data.data[1];

    // 28. Student cannot assign complaints
    const studentAssignRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${testComplaintId}/assign`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliToken}` }
      },
      { departmentId: firstDept.id, assignmentNotes: 'Student trying to assign' }
    );
    assert(studentAssignRes.statusCode === 403, '40. Student blocked from assigning complaint (HTTP 403 Forbidden)');

    // 29. Admin cannot assign to invalid department
    const invalidDeptRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${testComplaintId}/assign`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
      },
      { departmentId: 9999, assignmentNotes: 'Non-existent department' }
    );
    assert(invalidDeptRes.statusCode === 400 && invalidDeptRes.data?.error?.code === 'INVALID_DEPARTMENT', '41. Rejects invalid department ID (HTTP 400 INVALID_DEPARTMENT)');

    // 30. Assignee Role Enforcement: Cannot assign complaint to a student account
    const assignStudentRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${testComplaintId}/assign`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
      },
      { departmentId: firstDept.id, assignedToUserId: aliUserId, assignmentNotes: 'Assigning to student Ali (forbidden)' }
    );
    assert(assignStudentRes.statusCode === 400 && assignStudentRes.data?.error?.code === 'INVALID_ASSIGNEE', '42. Rejects assigning complaint to student account (HTTP 400 INVALID_ASSIGNEE)');

    // 31. Admin assigns complaint to first department + Admin staff member
    const validAssignRes1 = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${testComplaintId}/assign`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
      },
      { departmentId: firstDept.id, assignedToUserId: adminUserId, assignmentNotes: `Assigned to ${firstDept.name} maintenance team lead.` }
    );
    assert(validAssignRes1.statusCode === 200, `43. Complaint assigned to ${firstDept.name} and Admin staff (HTTP 200)`);
    assert(validAssignRes1.data.data.departmentName === firstDept.name, `44. Assignment response includes department name "${firstDept.name}"`);
    assert(validAssignRes1.data.data.assignedToName === adminFullName, `45. Assignment response includes assignedToName (${adminFullName})`);
    assert(validAssignRes1.data.data.isActive === true, '46. Assignment is marked active (isActive = true)');

    // 32. Reassignment: Admin reassigns to second department
    const validAssignRes2 = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/admin/complaints/${testComplaintId}/assign`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
      },
      { departmentId: secondDept.id, assignmentNotes: `Reassigned to ${secondDept.name} for specialist review.` }
    );
    assert(validAssignRes2.statusCode === 200, `47. Complaint reassigned to ${secondDept.name} (HTTP 200)`);
    assert(validAssignRes2.data.data.departmentName === secondDept.name, `48. Reassignment department name is "${secondDept.name}"`);

    // 33. Assignment History Tracking: Admin retrieves full assignment timeline
    const assignmentHistoryRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/admin/complaints/${testComplaintId}/assignments`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(assignmentHistoryRes.statusCode === 200, '49. Admin retrieved assignment history');
    assert(assignmentHistoryRes.data.data.length === 2, '50. Exactly 2 assignment records tracked in history');
    const [latestAssignment, previousAssignment] = assignmentHistoryRes.data.data;
    assert(latestAssignment.isActive === true && latestAssignment.departmentName === secondDept.name, '51. Most recent assignment is active');
    assert(previousAssignment.isActive === false && previousAssignment.departmentName === firstDept.name, '52. Previous assignment was deactivated (isActive = false)');

    // 34. Check Complaint Details embeds active assignment and comments
    const detailsRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/admin/complaints/${testComplaintId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(detailsRes.statusCode === 200, '53. Complaint details retrieved');
    assert(detailsRes.data.data.assignment !== null && detailsRes.data.data.assignment.departmentName === secondDept.name, `54. Active assignment correctly embedded in complaint details (${secondDept.name})`);
    assert(Array.isArray(detailsRes.data.data.history) && detailsRes.data.data.history.length === 4, '55. History correctly embedded in complaint details');
    assert(Array.isArray(detailsRes.data.data.comments) && detailsRes.data.data.comments.length === 4, '56. Comments correctly embedded in complaint details');

    // ------------------------------------------------------------------------
    // Feature 4: Security & Injection Defenses
    // ------------------------------------------------------------------------
    console.log('\n--- Feature 4: Security Defenses ---');

    // 35. SQL Injection defense in commentText
    const sqliCommentRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${testComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliToken}` }
      },
      { commentText: "'; DROP TABLE dbo.ComplaintComments; -- Testing SQL injection resilience" }
    );
    assert(sqliCommentRes.statusCode === 201, '57. Comment with SQL injection payload safely stored as text');

    // Verify table was NOT dropped
    const verifyCommentsStillExist = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${testComplaintId}/comments`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliToken}` }
    });
    assert(verifyCommentsStillExist.statusCode === 200, '58. Table integrity preserved after SQL injection test');

    // 36. Unauthenticated requests blocked
    const unauthCommentRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${testComplaintId}/comments`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { commentText: 'Unauthenticated attempt' }
    );
    assert(unauthCommentRes.statusCode === 401, '59. Unauthenticated comment rejected (HTTP 401 Unauthorized)');

    const unauthHistoryRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${testComplaintId}/history`,
      method: 'GET'
    });
    assert(unauthHistoryRes.statusCode === 401, '60. Unauthenticated history access rejected (HTTP 401 Unauthorized)');

    console.log('\n================================================================');
    console.log(`STAGE 6 VERIFICATION COMPLETED: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('================================================================');

  } catch (err) {
    console.error('\n[FATAL TEST FAILURE]:', err.message);
    throw err;
  } finally {
    if (server) {
      server.close();
      console.log('[Test Teardown] Stage 6 test server closed.');
    }
    await closePool();
    console.log('[Test Teardown] Database pool closed.');
  }
}

// Execute suite
runStage6Tests()
  .then(() => {
    console.log('[Stage 6 Test Suite Succeeded]');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Stage 6 Test Suite Failed]:', err);
    process.exit(1);
  });
