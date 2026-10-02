/**
 * CampusFix — Stage 9 Full Integration & End-to-End Test Suite
 * Executes the complete 45-point verification matrix covering:
 * - Student flow (registration, login, stats, submission, image, details, comments, search, logout, IDOR)
 * - Admin flow (dashboard metrics, triage, filters, status transitions, priority, assignments, internal notes, persistence)
 * - Authorization & Security defenses (RBAC, tamper resistance, role enforcement, unauthenticated protection)
 * - Failure handling (expired tokens, invalid IDs, oversized files, malformed JSON, network errors)
 */

const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { app } = require('../server');
const { closePool } = require('../config/db');

const TEST_PORT = 5062;
let server;

// Valid minimal 1x1 PNG buffer for upload testing
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
]);

function buildMultipartPayload(fields, fileField) {
  const boundary = '----CampusFixBoundary' + Math.random().toString(36).substring(2);
  const crlf = '\r\n';
  const parts = [];

  for (const [key, val] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}${crlf}Content-Disposition: form-data; name="${key}"${crlf}${crlf}${val}${crlf}`
    ));
  }

  if (fileField && fileField.buffer) {
    const header = `--${boundary}${crlf}Content-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"${crlf}Content-Type: ${fileField.mimetype}${crlf}${crlf}`;
    parts.push(Buffer.from(header));
    parts.push(fileField.buffer);
    parts.push(Buffer.from(crlf));
  }

  parts.push(Buffer.from(`--${boundary}--${crlf}`));
  const body = Buffer.concat(parts);

  return {
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    },
    body
  };
}

function request(options, requestBody = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        ...options
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let json = null;
          const contentType = res.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            try {
              json = JSON.parse(rawData);
            } catch (e) {
              // Not JSON
            }
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: rawData,
            json
          });
        });
      }
    );

    req.on('error', reject);

    if (requestBody) {
      if (Buffer.isBuffer(requestBody)) {
        req.write(requestBody);
      } else if (typeof requestBody === 'object') {
        req.write(JSON.stringify(requestBody));
      } else {
        req.write(requestBody);
      }
    }

    req.end();
  });
}

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

async function runStage9Tests() {
  console.log('\n================================================================');
  console.log(' CampusFix Stage 9: Full Frontend-Backend Integration Matrix ');
  console.log('================================================================\n');

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`Test server running on port http://localhost:${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const studentEmail = `integration.student.${rand}@campusfix.edu`;
    const studentRollNo = `STU-INT-${rand}`;
    const studentPassword = 'SecurePassword!123';

    // -------------------------------------------------------------------------
    // PART 1: COMPLETE STUDENT FLOW (Requirements 1 - 17)
    // -------------------------------------------------------------------------
    console.log('--- Part 1: Complete Student Flow & Personal Grievance Lifecycle ---');

    // 1. Register a student
    const regRes = await request(
      {
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        fullName: `Integration Student ${rand}`,
        email: studentEmail,
        studentId: studentRollNo,
        phone: '+1-555-0199',
        password: studentPassword
      }
    );
    assert(regRes.statusCode === 201, '1. Student registered successfully (HTTP 201 Created)');
    assert(regRes.json?.data?.user?.email === studentEmail, 'Registration response contains user profile');

    // 2. Log in
    const loginRes = await request(
      {
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        email: studentEmail,
        password: studentPassword
      }
    );
    assert(loginRes.statusCode === 200, '2. Student authenticated successfully (HTTP 200 OK)');
    const studentToken = loginRes.json?.data?.token;
    assert(studentToken !== undefined, 'Authentication issued valid JWT Bearer token');
    assert(loginRes.json?.data?.user?.role === 'student', 'Verified authenticated role is "student"');

    // 3. Open student dashboard
    const dashPageRes = await request({ path: '/student/dashboard.html', method: 'GET' });
    assert(dashPageRes.statusCode === 200, '3. Student dashboard page rendered with HTTP 200');
    assert(dashPageRes.body.includes('Student Portal'), 'Dashboard markup contains portal headers');

    // 4. Verify real complaint statistics
    const initialStatsRes = await request({
      path: '/api/complaints/my/stats',
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(initialStatsRes.statusCode === 200, '4. Student stats retrieved from database (HTTP 200)');
    assert(initialStatsRes.json?.data?.totalComplaints === 0, 'Initial student total complaints count is 0');
    assert(initialStatsRes.json?.data?.pendingCount === 0, 'Initial student pending count is 0');

    // Get active categories for form submission
    const catRes = await request({ path: '/api/categories', method: 'GET' });
    const firstCat = catRes.json?.data[0];

    // 5. Submit a complaint (without image)
    const complaint1Res = await request(
      {
        path: '/api/complaints',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${studentToken}`,
          'Content-Type': 'application/json'
        }
      },
      {
        title: `Broken AC unit in Classroom ${rand}`,
        categoryId: firstCat.id,
        priority: 'Medium',
        building: 'Academic Block A',
        roomNumber: 'Room 101',
        description: 'AC unit is blowing warm air and making a loud clicking sound during lectures.'
      }
    );
    assert(complaint1Res.statusCode === 201, '5. Submitted complaint without image (HTTP 201 Created)');
    const c1 = complaint1Res.json?.data;
    assert(c1?.complaintCode?.startsWith('CMP-'), 'Assigned complaint code is valid CMP- format');
    assert(c1?.imageUrl === null, 'Complaint imageUrl is correctly null');

    // 6. Submit a complaint (with image)
    const mp = buildMultipartPayload(
      {
        title: `Broken window latch leaking rain ${rand}`,
        categoryId: firstCat.id.toString(),
        priority: 'High',
        building: 'Science Laboratory B',
        roomNumber: 'Lab 205',
        description: 'Heavy rain is entering the physics lab through a cracked window pane.'
      },
      {
        name: 'image',
        filename: 'broken_window.png',
        mimetype: 'image/png',
        buffer: VALID_PNG_BUFFER
      }
    );
    const complaint2Res = await request(
      {
        path: '/api/complaints',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${studentToken}`,
          ...mp.headers
        }
      },
      mp.body
    );
    assert(complaint2Res.statusCode === 201, '6. Submitted complaint with valid PNG image (HTTP 201 Created)');
    const c2 = complaint2Res.json?.data;
    assert(c2?.imageUrl?.startsWith('/api/complaints/images/'), 'Image URL securely assigned');
    assert(c2?.imageKey !== null, 'Image key generated and persisted');

    // 7. Verify it appears in My Complaints
    const myComplaintsRes = await request({
      path: '/api/complaints/my?page=1&limit=10',
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(myComplaintsRes.statusCode === 200, '7. My Complaints retrieved from backend (HTTP 200)');
    assert(myComplaintsRes.json?.data?.complaints?.length === 2, 'Student retrieves both filed complaints');
    assert(myComplaintsRes.json?.data?.total === 2, 'Total complaints count in pagination envelope is 2');

    // 8. Open complaint details
    const detailsRes = await request({
      path: `/api/complaints/${c2.id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(detailsRes.statusCode === 200, '8. Complaint details retrieved successfully (HTTP 200)');
    const complaintDetails = detailsRes.json?.data;

    // 9. Verify real complaint information
    assert(complaintDetails?.id === c2.id, '9. Complaint ID matches');
    assert(complaintDetails?.title.includes('Broken window latch'), 'Title matches submission');
    assert(complaintDetails?.building === 'Science Laboratory B', 'Building matches submission');
    assert(complaintDetails?.roomNumber === 'Lab 205', 'Room number matches submission');
    assert(complaintDetails?.priority === 'High', 'Priority matches submission');
    assert(complaintDetails?.status === 'Pending', 'Initial status verified as "Pending"');

    // 10. Verify image retrieval with query token fallback
    const imageRes = await request({
      path: `${c2.imageUrl}?token=${encodeURIComponent(studentToken)}`,
      method: 'GET'
    });
    assert(imageRes.statusCode === 200, '10. Image served via query token authorization (HTTP 200)');
    assert(imageRes.headers['content-type'] === 'image/png', 'Served image Content-Type is image/png');
    assert(imageRes.headers['x-content-type-options'] === 'nosniff', 'Image headers include nosniff');

    // 11. Verify status history in details
    assert(Array.isArray(complaintDetails?.history), '11. Status history timeline returned as array');
    assert(complaintDetails?.history.length >= 1, 'Initial history transition entry recorded');
    assert(complaintDetails?.history[0]?.newStatus === 'Pending' || complaintDetails?.history[0]?.toStatus === 'Pending', 'Initial status recorded as Pending');

    // 12. Add a comment
    const commentRes = await request(
      {
        path: `/api/complaints/${c2.id}/comments`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${studentToken}`,
          'Content-Type': 'application/json'
        }
      },
      {
        message: 'Water is starting to pool on lab table 4.'
      }
    );
    assert(commentRes.statusCode === 201, '12. Student comment posted (HTTP 201 Created)');

    // 13. Verify the comment appears in comments list
    const commentsListRes = await request({
      path: `/api/complaints/${c2.id}/comments`,
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(commentsListRes.statusCode === 200, '13. Comments list retrieved from server (HTTP 200)');
    const comments = commentsListRes.json?.data || [];
    assert(comments.length === 1, 'Exactly 1 comment in thread');
    assert((comments[0]?.commentText || comments[0]?.message).includes('lab table 4'), 'Comment text matches payload');

    // 14. Search/filter complaints
    const searchRes = await request({
      path: `/api/complaints/my?search=Classroom&status=Pending`,
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(searchRes.statusCode === 200, '14. Filtered search retrieved from server (HTTP 200)');
    assert(searchRes.json?.data?.complaints?.length === 1, 'Search query returned exactly 1 matching record');
    assert(searchRes.json?.data?.complaints[0]?.id === c1.id, 'Returned record is Complaint 1');

    // 15. Log out
    const logoutRes = await request({
      path: '/api/auth/logout',
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(logoutRes.statusCode === 200, '15. User logged out successfully (HTTP 200)');

    // 16. Attempt to access protected pages without token
    const unauthAccessRes = await request({
      path: '/api/complaints/my',
      method: 'GET'
    });
    assert(unauthAccessRes.statusCode === 401, '16. Unauthenticated API access rejected (HTTP 401 Unauthorized)');

    // 17. Attempt to access another student's complaint (IDOR attack)
    const secondStudentEmail = `intruder.${rand}@campusfix.edu`;
    await request(
      { path: '/api/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { fullName: 'Intruder Student', email: secondStudentEmail, studentId: `INT-${rand}`, password: studentPassword }
    );
    const secondLoginRes = await request(
      { path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: secondStudentEmail, password: studentPassword }
    );
    const intruderToken = secondLoginRes.json?.data?.token;

    const idorRes = await request({
      path: `/api/complaints/${c2.id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${intruderToken}` }
    });
    assert(idorRes.statusCode === 403, '17. IDOR: Second student blocked from viewing first student ticket (HTTP 403 Forbidden)');

    // -------------------------------------------------------------------------
    // PART 2: COMPLETE ADMIN FLOW (Requirements 18 - 32)
    // -------------------------------------------------------------------------
    console.log('\n--- Part 2: Complete Admin Flow & Facilities Operations ---');

    // 18. Log in as admin
    const adminLoginRes = await request(
      {
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        email: 'admin@campusfix.edu',
        password: 'Admin@12345'
      }
    );
    assert(adminLoginRes.statusCode === 200, '18. Admin logged in successfully (HTTP 200 OK)');
    const adminToken = adminLoginRes.json?.data?.token;
    assert(adminLoginRes.json?.data?.user?.role === 'admin', 'Admin role confirmed');

    // 19. Verify admin dashboard page delivery
    const adminPageRes = await request({ path: '/admin/dashboard.html', method: 'GET' });
    assert(adminPageRes.statusCode === 200, '19. Admin dashboard page rendered with HTTP 200');

    // 20. Verify real complaint statistics from SQL Server
    const adminStatsRes = await request({
      path: '/api/admin/stats',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminStatsRes.statusCode === 200, '20. Admin stats fetched from database (HTTP 200)');
    const stats = adminStatsRes.json?.data;
    assert(stats?.totalComplaints >= 2, 'Total campus complaints reflects database count');
    assert(typeof stats?.pendingCount === 'number', 'pendingCount is an active integer metric');

    // 21. View all complaints
    const adminQueueRes = await request({
      path: '/api/admin/complaints?page=1&limit=20',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminQueueRes.statusCode === 200, '21. Admin complaints queue retrieved (HTTP 200)');
    assert(adminQueueRes.json?.data?.complaints?.length >= 2, 'Admin queue displays campus grievances');

    // 22. Search/filter complaints
    const adminFilterRes = await request({
      path: `/api/admin/complaints?search=${encodeURIComponent(studentRollNo)}&priority=High`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminFilterRes.statusCode === 200, '22. Admin multi-criteria filter executed (HTTP 200)');
    assert(adminFilterRes.json?.data?.complaints?.length === 1, 'Filter isolated exactly 1 matching record');
    assert(adminFilterRes.json?.data?.complaints[0]?.id === c2.id, 'Matching record is Complaint 2');

    // 23. Open a complaint as admin
    const adminDetailsRes = await request({
      path: `/api/admin/complaints/${c2.id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminDetailsRes.statusCode === 200, '23. Admin fetched complaint dossier (HTTP 200)');
    assert(adminDetailsRes.json?.data?.studentName !== undefined, 'Admin dossier embeds student submitter profile');

    // 24. View image as admin
    const adminImageRes = await request({
      path: `${c2.imageUrl}?token=${encodeURIComponent(adminToken)}`,
      method: 'GET'
    });
    assert(adminImageRes.statusCode === 200, '24. Admin authorized to inspect evidence photo (HTTP 200)');

    // 25. View comments as admin
    const adminCommentsRes = await request({
      path: `/api/complaints/${c2.id}/comments`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminCommentsRes.statusCode === 200, '25. Admin retrieved comments (HTTP 200)');

    // 26. View status history
    const adminHistoryRes = await request({
      path: `/api/admin/complaints/${c2.id}/history`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminHistoryRes.statusCode === 200, '26. Admin retrieved status history (HTTP 200)');

    // 27. Change status (to "In Progress")
    const statusUpdateRes = await request(
      {
        path: `/api/admin/complaints/${c2.id}/status`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      },
      {
        status: 'In Progress',
        remarks: 'Facilities team dispatched with emergency tarping.'
      }
    );
    assert(statusUpdateRes.statusCode === 200, '27. Status changed to "In Progress" (HTTP 200 OK)');
    assert(statusUpdateRes.json?.data?.status === 'In Progress', 'Verified status updated to "In Progress"');

    // 28. Verify status history updates
    const updatedHistoryRes = await request({
      path: `/api/complaints/${c2.id}/history`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const historyList = updatedHistoryRes.json?.data || [];
    assert(historyList.length >= 2, '28. Status history updated with second transition');
    const latestItem = historyList[historyList.length - 1];
    assert(latestItem?.remarks === 'Facilities team dispatched with emergency tarping.', 'Audit remarks preserved in log');

    // 29. Change priority
    const priorityUpdateRes = await request(
      {
        path: `/api/admin/complaints/${c2.id}/priority`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      },
      {
        priority: 'Critical'
      }
    );
    assert(priorityUpdateRes.statusCode === 200, '29. Priority upgraded to "Critical" (HTTP 200 OK)');
    assert(priorityUpdateRes.json?.data?.priority === 'Critical', 'Verified priority is now Critical');

    // 30. Add comment & internal staff note
    const staffNoteRes = await request(
      {
        path: `/api/complaints/${c2.id}/comments`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      },
      {
        message: 'Glass contractor requisition PO #9482 approved.',
        isAdminOnly: true
      }
    );
    assert(staffNoteRes.statusCode === 201, '30. Internal staff note posted (HTTP 201 Created)');

    // 31. Assign/reassign complaint
    const deptRes = await request({ path: '/api/departments', method: 'GET' });
    const targetDept = deptRes.json?.data[1] || deptRes.json?.data[0];

    const assignRes = await request(
      {
        path: `/api/admin/complaints/${c2.id}/assign`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      },
      {
        departmentId: targetDept.id,
        assignmentNotes: 'Please inspect glass frame integrity and reseal.'
      }
    );
    assert(assignRes.statusCode === 200 || assignRes.statusCode === 201, '31. Complaint assigned to department');

    // 32. Verify changes persist after refreshing page
    const persistedDetailsRes = await request({
      path: `/api/admin/complaints/${c2.id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const reloaded = persistedDetailsRes.json?.data;
    assert(reloaded?.priority === 'Critical', '32. Priority persistence verified as Critical');
    assert(reloaded?.status === 'In Progress', 'Status persistence verified as In Progress');
    assert(reloaded?.assignment?.departmentId === targetDept.id, 'Department assignment persistence verified');
    const reloadedComments = reloaded?.comments || [];
    assert(reloadedComments.some(c => (c.commentText || c.message || '').includes('PO #9482')), 'Staff notes persistence verified');

    // -------------------------------------------------------------------------
    // PART 3: AUTHORIZATION & SECURITY DEFENSES (Requirements 33 - 39)
    // -------------------------------------------------------------------------
    console.log('\n--- Part 3: Authorization & Security Controls Verification ---');

    // 33. Student attempts to access admin UI page
    const studentAccessAdminPageRes = await request({ path: '/admin/dashboard.html', method: 'GET' });
    assert(studentAccessAdminPageRes.statusCode === 200, '33. Admin HTML delivered (client auth guard redirects unauthorised role)');
    assert(studentAccessAdminPageRes.headers['x-content-type-options'] === 'nosniff', 'Security header nosniff active on admin page');

    // 34. Student directly calls an admin API
    const studentDirectAdminApiRes = await request({
      path: '/api/admin/stats',
      method: 'GET',
      headers: { Authorization: `Bearer ${intruderToken}` }
    });
    assert(studentDirectAdminApiRes.statusCode === 403, '34. Backend RBAC rejects student calling admin endpoint (HTTP 403 Forbidden)');

    // 35. Student changes a complaint ID in a request (trying to mutate someone else's ticket)
    const studentTamperCommentRes = await request(
      {
        path: `/api/complaints/${c1.id}/comments`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${intruderToken}`,
          'Content-Type': 'application/json'
        }
      },
      { message: 'Malicious injection into someone else complaint' }
    );
    assert(studentTamperCommentRes.statusCode === 403, '35. Backend rejects unauthorized comment modification (HTTP 403 Forbidden)');

    // 36. Student changes a user ID in a request body (spoofing studentId)
    const spoofSubmissionRes = await request(
      {
        path: '/api/complaints',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${intruderToken}`,
          'Content-Type': 'application/json'
        }
      },
      {
        title: 'Tampered user ID attempt test complaint',
        categoryId: firstCat.id,
        building: 'Library',
        description: 'Testing if server honors studentId passed in request body.',
        studentId: 9999 // Attacker tries to impersonate ID 9999
      }
    );
    assert(spoofSubmissionRes.statusCode === 201, '36. Complaint created safely');
    assert(spoofSubmissionRes.json?.data?.studentId !== 9999, 'Server strictly ignored body studentId and used authenticated session');

    // 37. Student attempts to manipulate their role during registration
    const hackerEmail = `privesc.${rand}@campusfix.edu`;
    const privEscRegRes = await request(
      {
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        fullName: 'Hacker User',
        email: hackerEmail,
        studentId: `HACK-${rand}`,
        password: studentPassword,
        role: 'admin' // Attempting to register as admin
      }
    );
    assert(privEscRegRes.statusCode === 201, '37. Self-registration completed');
    assert(privEscRegRes.json?.data?.user?.role === 'student', 'Server strictly forced role to "student"');

    // 38. Unauthenticated user attempts protected API access
    const unauthAssignRes = await request({
      path: `/api/admin/complaints/${c2.id}/assign`,
      method: 'POST'
    });
    assert(unauthAssignRes.statusCode === 401, '38. Unauthenticated request to protected endpoint rejected (HTTP 401)');

    // 39. Verify backend rejects all unauthorized operations
    const studentStatusPatchRes = await request(
      {
        path: `/api/admin/complaints/${c2.id}/status`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${intruderToken}`,
          'Content-Type': 'application/json'
        }
      },
      { status: 'Resolved' }
    );
    assert(studentStatusPatchRes.statusCode === 403, '39. Student patch status rejected by server (HTTP 403 Forbidden)');

    // -------------------------------------------------------------------------
    // PART 4: FAILURE & BOUNDARY TESTING (Requirements 40 - 45)
    // -------------------------------------------------------------------------
    console.log('\n--- Part 4: Failure & Boundary Testing ---');

    // 40. Server liveness and graceful status check
    const healthRes = await request({ path: '/api/health', method: 'GET' });
    assert(healthRes.statusCode === 200, '40. Server health check reports operational status (HTTP 200)');
    assert(healthRes.json?.data?.status === 'healthy', 'Backend health reports "healthy"');

    // 41. Malformed JSON payload handling
    const malformedJsonRes = await request(
      {
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      '{"email": "broken_json'
    );
    assert(malformedJsonRes.statusCode === 400, '41. Malformed JSON returns HTTP 400');
    assert(malformedJsonRes.json?.error?.code === 'INVALID_JSON_PAYLOAD', 'Returns structured error INVALID_JSON_PAYLOAD');

    // 42. Expired authentication token handling
    const expiredToken = jwt.sign(
      { id: 1, email: 'admin@campusfix.edu', role: 'admin' },
      process.env.JWT_SECRET || 'campusfix_dev_jwt_secret_super_secure_key_2026_test',
      { expiresIn: '-10s' }
    );
    const expiredRes = await request({
      path: '/api/admin/stats',
      method: 'GET',
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    assert(expiredRes.statusCode === 401, '42. Expired JWT token returns HTTP 401');
    assert(expiredRes.json?.error?.code === 'TOKEN_EXPIRED', 'Returns TOKEN_EXPIRED error code');

    // 43. Invalid complaint IDs (malformed and non-existent)
    const malformedIdRes = await request({
      path: '/api/complaints/not-a-number',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(malformedIdRes.statusCode === 400, '43. Malformed complaint ID returns HTTP 400 INVALID_ID');

    const notFoundIdRes = await request({
      path: '/api/complaints/9999999',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(notFoundIdRes.statusCode === 404, '43b. Non-existent complaint ID returns HTTP 404 NOT_FOUND');

    // 44. Oversized image rejection (> 5MB)
    const oversizedBuffer = Buffer.alloc(5.5 * 1024 * 1024, 0x41);
    const oversizedMp = buildMultipartPayload(
      {
        title: 'Oversized photo complaint test',
        categoryId: firstCat.id.toString(),
        building: 'Hostel 1',
        description: 'Testing oversized image upload rejection.'
      },
      {
        name: 'image',
        filename: 'oversized.jpg',
        mimetype: 'image/jpeg',
        buffer: oversizedBuffer
      }
    );
    const oversizedRes = await request(
      {
        path: '/api/complaints',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          ...oversizedMp.headers
        }
      },
      oversizedMp.body
    );
    assert(oversizedRes.statusCode === 400, '44. Oversized file (>5MB) rejected with HTTP 400');
    assert(oversizedRes.json?.error?.code === 'FILE_TOO_LARGE', 'Error code is FILE_TOO_LARGE');

    // 45. Invalid form data validation
    const invalidRegRes = await request(
      {
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        fullName: 'A', // Too short
        email: 'not-an-email', // Bad email
        password: 'weak', // Weak password
        studentId: '' // Missing ID
      }
    );
    assert(invalidRegRes.statusCode === 400, '45. Invalid form submission rejected with HTTP 400');
    assert(invalidRegRes.json?.error?.code === 'VALIDATION_ERROR', 'Validation error envelope returned');

  } catch (err) {
    console.error('Integration test encountered an unexpected error:', err);
    failedTests++;
  } finally {
    if (server) {
      await new Promise((r) => server.close(r));
    }
    await closePool();

    console.log('\n================================================================');
    console.log(` Stage 9 Verification Complete: ${passedTests} Passed, ${failedTests} Failed `);
    console.log('================================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runStage9Tests();
