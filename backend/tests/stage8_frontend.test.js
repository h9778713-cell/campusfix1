/**
 * CampusFix — Stage 8 Frontend Integration & End-to-End Test Suite
 * Tests static file delivery, clean URL routing, security headers, metadata APIs,
 * and complete real user journeys (Student & Admin) using live backend APIs and database.
 */

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { app } = require('../server');
const { closePool } = require('../config/db');

const TEST_PORT = 5061;
let server;

// Helper to create a valid minimal 1x1 PNG for image upload tests
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
]);

function buildMultipartPayload(fields, fileField) {
  const boundary = '----CampusFixTestBoundary' + Math.random().toString(36).substring(2);
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
              // Non-JSON response
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

// Test assertion runner
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

async function runTests() {
  console.log('\n======================================================');
  console.log(' CampusFix Stage 8: Frontend & Full Integration Tests ');
  console.log('======================================================\n');

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`Test server running on http://localhost:${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // ----------------------------------------------------
    // Suite 1: Static HTML Pages Delivery
    // ----------------------------------------------------
    console.log('--- Suite 1: Static HTML & Clean URL Delivery ---');

    // 1. Root page
    const rootRes = await request({ path: '/', method: 'GET' });
    assert(rootRes.statusCode === 200, 'GET / returns HTTP 200');
    assert(rootRes.headers['content-type'].includes('text/html'), 'GET / Content-Type is text/html');
    assert(rootRes.body.includes('CampusFix'), 'GET / contains "CampusFix" title/branding');

    // 2. Index.html
    const indexRes = await request({ path: '/index.html', method: 'GET' });
    assert(indexRes.statusCode === 200, 'GET /index.html returns HTTP 200');

    // 3. Login page (both clean and .html)
    const loginCleanRes = await request({ path: '/login', method: 'GET' });
    assert(loginCleanRes.statusCode === 200, 'GET /login (clean URL) returns HTTP 200');
    const loginRes = await request({ path: '/login.html', method: 'GET' });
    assert(loginRes.statusCode === 200, 'GET /login.html returns HTTP 200');
    assert(loginRes.body.includes('Sign In to CampusFix'), 'Login page contains sign in header');

    // 4. Register page (both clean and .html)
    const registerCleanRes = await request({ path: '/register', method: 'GET' });
    assert(registerCleanRes.statusCode === 200, 'GET /register (clean URL) returns HTTP 200');
    const registerRes = await request({ path: '/register.html', method: 'GET' });
    assert(registerRes.statusCode === 200, 'GET /register.html returns HTTP 200');
    assert(registerRes.body.includes('Create Student Account'), 'Register page contains account creation header');

    // 5. Student portal pages
    const studentDashRes = await request({ path: '/student/dashboard.html', method: 'GET' });
    assert(studentDashRes.statusCode === 200, 'GET /student/dashboard.html returns HTTP 200');
    assert(studentDashRes.body.includes('Student Portal'), 'Student dashboard contains portal title');

    const studentSubmitRes = await request({ path: '/student/submit.html', method: 'GET' });
    assert(studentSubmitRes.statusCode === 200, 'GET /student/submit.html returns HTTP 200');
    assert(studentSubmitRes.body.includes('Report a Facility or Campus Issue'), 'Submit page contains form header');

    const studentComplaintsRes = await request({ path: '/student/complaints.html', method: 'GET' });
    assert(studentComplaintsRes.statusCode === 200, 'GET /student/complaints.html returns HTTP 200');
    assert(studentComplaintsRes.body.includes('My Maintenance Grievances'), 'Complaints listing contains header');

    const studentDetailsRes = await request({ path: '/student/details.html', method: 'GET' });
    assert(studentDetailsRes.statusCode === 200, 'GET /student/details.html returns HTTP 200');
    assert(studentDetailsRes.body.includes('Grievance Details'), 'Details page contains details header');

    // 6. Admin portal pages
    const adminDashRes = await request({ path: '/admin/dashboard.html', method: 'GET' });
    assert(adminDashRes.statusCode === 200, 'GET /admin/dashboard.html returns HTTP 200');
    assert(adminDashRes.body.includes('Facilities Administration Center'), 'Admin dashboard contains center title');

    const adminComplaintsRes = await request({ path: '/admin/complaints.html', method: 'GET' });
    assert(adminComplaintsRes.statusCode === 200, 'GET /admin/complaints.html returns HTTP 200');
    assert(adminComplaintsRes.body.includes('Campus Maintenance Complaints Queue'), 'Admin queue contains queue title');

    const adminDetailsRes = await request({ path: '/admin/details.html', method: 'GET' });
    assert(adminDetailsRes.statusCode === 200, 'GET /admin/details.html returns HTTP 200');
    assert(adminDetailsRes.body.includes('Manage Grievance'), 'Admin details contains manage header');

    // ----------------------------------------------------
    // Suite 2: Static Assets & Security Headers
    // ----------------------------------------------------
    console.log('\n--- Suite 2: CSS/JS Assets & Security Headers ---');

    // 7. CSS stylesheet
    const cssRes = await request({ path: '/css/style.css', method: 'GET' });
    assert(cssRes.statusCode === 200, 'GET /css/style.css returns HTTP 200');
    assert(cssRes.headers['content-type'].includes('text/css'), 'CSS Content-Type is text/css');
    assert(cssRes.body.includes('--color-primary'), 'CSS contains custom CSS variables');

    // 8. JS modules
    const apiJsRes = await request({ path: '/js/api.js', method: 'GET' });
    assert(apiJsRes.statusCode === 200, 'GET /js/api.js returns HTTP 200');
    assert(apiJsRes.body.includes('api = {'), 'api.js defines api client object');

    const authJsRes = await request({ path: '/js/auth.js', method: 'GET' });
    assert(authJsRes.statusCode === 200, 'GET /js/auth.js returns HTTP 200');
    assert(authJsRes.body.includes('requireAuth'), 'auth.js implements requireAuth guard');

    const compJsRes = await request({ path: '/js/components.js', method: 'GET' });
    assert(compJsRes.statusCode === 200, 'GET /js/components.js returns HTTP 200');
    assert(compJsRes.body.includes('escapeHtml'), 'components.js implements escapeHtml for XSS prevention');

    // 9. Security headers
    assert(rootRes.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff header present');
    assert(rootRes.headers['content-security-policy'] !== undefined, 'Content-Security-Policy header present');

    // ----------------------------------------------------
    // Suite 3: Shared Form & Filter Metadata APIs
    // ----------------------------------------------------
    console.log('\n--- Suite 3: Categories & Departments APIs ---');

    const catRes = await request({ path: '/api/categories', method: 'GET' });
    assert(catRes.statusCode === 200, 'GET /api/categories returns HTTP 200');
    assert(catRes.json?.success === true, 'Categories response success is true');
    assert(Array.isArray(catRes.json?.data) && catRes.json.data.length > 0, 'Categories returned as non-empty array');
    const firstCat = catRes.json.data[0];

    const deptRes = await request({ path: '/api/departments', method: 'GET' });
    assert(deptRes.statusCode === 200, 'GET /api/departments returns HTTP 200');
    assert(deptRes.json?.success === true, 'Departments response success is true');
    assert(Array.isArray(deptRes.json?.data) && deptRes.json.data.length > 0, 'Departments returned as non-empty array');
    const firstDept = deptRes.json.data[0];

    // ----------------------------------------------------
    // Suite 4: End-to-End Student Journey
    // ----------------------------------------------------
    console.log('\n--- Suite 4: Student Journey (Register -> Login -> Submit -> View) ---');

    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const studentEmail = `student_${randSuffix}@campusfix.edu`;
    const studentRollNo = `STU-2026-${randSuffix}`;
    const studentPassword = 'SecurePassword!123';

    // 10. Student Registration
    const regRes = await request(
      {
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        fullName: `Alex Rivera ${randSuffix}`,
        email: studentEmail,
        studentId: studentRollNo,
        phone: '+1-555-0188',
        password: studentPassword
      }
    );
    assert(regRes.statusCode === 201, 'Student self-registration returns HTTP 201 Created');
    assert(regRes.json?.data?.user?.email === studentEmail, 'Registered user email matches');

    // 11. Student Login
    const loginActionRes = await request(
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
    assert(loginActionRes.statusCode === 200, 'Student login returns HTTP 200 OK');
    const studentToken = loginActionRes.json?.data?.token;
    const studentUser = loginActionRes.json?.data?.user;
    assert(studentToken !== undefined, 'Login issues JWT Bearer token');
    assert(studentUser?.role === 'student', 'User role is "student"');

    // 12. Student Dashboard Stats (Initially zero)
    const initialStatsRes = await request({
      path: '/api/complaints/my/stats',
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(initialStatsRes.statusCode === 200, 'GET /api/complaints/my/stats returns HTTP 200');
    assert(initialStatsRes.json?.data?.totalComplaints === 0, 'Initial student totalComplaints is 0');

    // 13. Student Complaint Submission with Photo Evidence
    const complaintTitle = `Flooded Lab Corridor ${randSuffix}`;
    const mp = buildMultipartPayload(
      {
        title: complaintTitle,
        categoryId: firstCat.id.toString(),
        priority: 'High',
        building: 'Science Complex C',
        roomNumber: 'Lab 302',
        description: 'Water pipe leaking heavily under the chemical storage sink, risk of slipping.'
      },
      {
        name: 'image',
        filename: 'pipe_leak.png',
        mimetype: 'image/png',
        buffer: VALID_PNG_BUFFER
      }
    );

    const submitRes = await request(
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
    assert(submitRes.statusCode === 201, 'Complaint submission returns HTTP 201 Created');
    const createdComplaint = submitRes.json?.data;
    assert(createdComplaint?.complaintCode?.startsWith('CMP-'), 'Assigned complaint code starts with CMP-');
    assert(createdComplaint?.imageUrl !== null, 'Image URL was assigned to complaint');
    assert(createdComplaint?.status === 'Pending', 'Initial complaint status is "Pending"');

    // 14. Student Dashboard Stats (Updated to 1)
    const updatedStatsRes = await request({
      path: '/api/complaints/my/stats',
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(updatedStatsRes.json?.data?.totalComplaints === 1, 'Student totalComplaints incremented to 1');
    assert(updatedStatsRes.json?.data?.pendingCount === 1, 'Student pendingCount incremented to 1');

    // 15. Student My Complaints List
    const myComplaintsRes = await request({
      path: '/api/complaints/my?page=1&limit=10',
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(myComplaintsRes.statusCode === 200, 'GET /api/complaints/my returns HTTP 200');
    assert(myComplaintsRes.json?.data?.complaints?.length === 1, 'Student sees their newly filed complaint');
    assert(myComplaintsRes.json?.data?.complaints[0]?.id === createdComplaint.id, 'Complaint ID matches');

    // 16. Student Filter by Status
    const filterStatusRes = await request({
      path: '/api/complaints/my?status=Pending',
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(filterStatusRes.json?.data?.complaints?.length === 1, 'Filter by status=Pending returns 1 record');

    const filterOtherStatusRes = await request({
      path: '/api/complaints/my?status=Resolved',
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(filterOtherStatusRes.json?.data?.complaints?.length === 0, 'Filter by status=Resolved returns 0 records');

    // 17. Student Complaint Details
    const detailsRes = await request({
      path: `/api/complaints/${createdComplaint.id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(detailsRes.statusCode === 200, 'GET /api/complaints/:id returns HTTP 200');
    assert(detailsRes.json?.data?.id === createdComplaint.id, 'Details ID matches');
    assert(Array.isArray(detailsRes.json?.data?.history), 'Status history included in response');
    assert(detailsRes.json?.data?.history?.length >= 1, 'Initial history transition recorded');

    // 18. Student Adds Comment
    const commentRes = await request(
      {
        path: `/api/complaints/${createdComplaint.id}/comments`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${studentToken}`,
          'Content-Type': 'application/json'
        }
      },
      {
        message: 'The water is beginning to leak into the hallway outside Room 302.'
      }
    );
    assert(commentRes.statusCode === 201, 'Student comment returns HTTP 201 Created');

    // 19. IDOR Defense (Second Student cannot view complaint)
    const secondRegRes = await request(
      {
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        fullName: 'Second Student',
        email: `student2_${randSuffix}@campusfix.edu`,
        studentId: `STU2-${randSuffix}`,
        password: studentPassword
      }
    );
    const secondLoginRes = await request(
      {
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        email: `student2_${randSuffix}@campusfix.edu`,
        password: studentPassword
      }
    );
    const secondStudentToken = secondLoginRes.json?.data?.token;

    const idorRes = await request({
      path: `/api/complaints/${createdComplaint.id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${secondStudentToken}` }
    });
    assert(idorRes.statusCode === 403, 'IDOR Defense: Unauthorized student receives HTTP 403 Forbidden');

    // ----------------------------------------------------
    // Suite 5: End-to-End Admin Journey & Workflow
    // ----------------------------------------------------
    console.log('\n--- Suite 5: Admin Journey (Stats -> Queue -> Triage -> Assign -> Resolve) ---');

    // 20. Admin Login (using seeded admin account)
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
    assert(adminLoginRes.statusCode === 200, 'Admin login returns HTTP 200 OK');
    const adminToken = adminLoginRes.json?.data?.token;
    assert(adminLoginRes.json?.data?.user?.role === 'admin', 'Admin role verified');

    // 21. Admin Authorization Gate
    const unauthStatsRes = await request({ path: '/api/admin/stats', method: 'GET' });
    assert(unauthStatsRes.statusCode === 401, 'Unauthenticated /api/admin/stats returns HTTP 401 Unauthorized');

    const forbiddenStatsRes = await request({
      path: '/api/admin/stats',
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(forbiddenStatsRes.statusCode === 403, 'Student accessing /api/admin/stats returns HTTP 403 Forbidden');

    // 22. Admin Dashboard Stats
    const adminStatsRes = await request({
      path: '/api/admin/stats',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminStatsRes.statusCode === 200, 'Admin GET /api/admin/stats returns HTTP 200 OK');
    assert(typeof adminStatsRes.json?.data?.totalComplaints === 'number', 'adminStats.totalComplaints is a number');
    assert(typeof adminStatsRes.json?.data?.pendingCount === 'number', 'adminStats.pendingCount is a number');

    // 23. Admin Triage Queue Listing
    const adminQueueRes = await request({
      path: '/api/admin/complaints?page=1&limit=10',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminQueueRes.statusCode === 200, 'GET /api/admin/complaints returns HTTP 200 OK');
    assert(adminQueueRes.json?.data?.complaints?.length > 0, 'Admin sees campus complaints in queue');

    // 24. Admin View Complaint Details
    const adminDetailsViewRes = await request({
      path: `/api/admin/complaints/${createdComplaint.id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminDetailsViewRes.statusCode === 200, 'GET /api/admin/complaints/:id returns HTTP 200 OK');
    assert(adminDetailsViewRes.json?.data?.studentName !== undefined, 'Admin details include student submitter info');

    // 25. Admin Updates Priority to "Critical"
    const priorityRes = await request(
      {
        path: `/api/admin/complaints/${createdComplaint.id}/priority`,
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
    assert(priorityRes.statusCode === 200, 'Priority update to "Critical" returns HTTP 200 OK');
    assert(priorityRes.json?.data?.priority === 'Critical', 'Verified priority is now Critical');

    // 26. Admin Assigns Complaint to Department
    const assignRes = await request(
      {
        path: `/api/admin/complaints/${createdComplaint.id}/assign`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      },
      {
        departmentId: firstDept.id,
        assignmentNotes: 'Emergency plumbing crew dispatched with wet vac and pipe clamps.'
      }
    );
    assert(assignRes.statusCode === 200 || assignRes.statusCode === 201, 'Department assignment returns HTTP 200/201 Success');

    // 27. Admin Checks Assignment History
    const assignHistoryRes = await request({
      path: `/api/admin/complaints/${createdComplaint.id}/assignments`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(assignHistoryRes.statusCode === 200, 'GET /api/admin/complaints/:id/assignments returns HTTP 200');
    assert(assignHistoryRes.json?.data?.length >= 1, 'Assignment history contains at least 1 record');
    assert(assignHistoryRes.json?.data[0]?.departmentName === firstDept.name, 'Assignment record department matches');

    // 28. Admin Adds Internal Staff Note (isAdminOnly: true)
    const staffNoteRes = await request(
      {
        path: `/api/complaints/${createdComplaint.id}/comments`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      },
      {
        message: 'Main shutoff valve located in basement B1. Isolation completed.',
        isAdminOnly: true
      }
    );
    assert(staffNoteRes.statusCode === 201, 'Admin staff note returns HTTP 201 Created');

    // 29. Confidentiality Check: Student DOES NOT see isAdminOnly note
    const studentCommentCheckRes = await request({
      path: `/api/complaints/${createdComplaint.id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const studentComments = studentCommentCheckRes.json?.data?.comments || [];
    const hasSecretNote = studentComments.some(c => c.isAdminOnly === true || (c.commentText || '').includes('Main shutoff valve'));
    assert(!hasSecretNote, 'Student view strictly filters out internal admin notes (Zero leakage)');

    // 30. Admin Transparency Check: Admin DOES see isAdminOnly note
    const adminCommentCheckRes = await request({
      path: `/api/admin/complaints/${createdComplaint.id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminComments = adminCommentCheckRes.json?.data?.comments || [];
    const adminSeesSecretNote = adminComments.some(c => c.isAdminOnly === true && (c.commentText || '').includes('Main shutoff valve'));
    assert(adminSeesSecretNote, 'Admin view displays internal staff notes correctly');

    // 31. Verify complaint was auto-advanced to "In Progress" upon assignment
    const autoProgressComplaintRes = await request({
      path: `/api/admin/complaints/${createdComplaint.id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(autoProgressComplaintRes.statusCode === 200, 'Complaint details accessible');
    assert(autoProgressComplaintRes.json?.data?.status === 'In Progress', 'Complaint status auto-advanced to "In Progress" on assignment');

    // 32. Admin Updates Status to "Resolved"
    const resolvedRes = await request(
      {
        path: `/api/admin/complaints/${createdComplaint.id}/status`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      },
      {
        status: 'Resolved',
        remarks: 'Pipe replaced, pressure tested at 60 PSI, corridor sanitized.'
      }
    );
    assert(resolvedRes.statusCode === 200, 'Status transition to "Resolved" returns HTTP 200 OK');
    assert(resolvedRes.json?.data?.status === 'Resolved', 'Status verified as "Resolved"');

    // 33. Status Audit History Timeline Verification
    const historyRes = await request({
      path: `/api/complaints/${createdComplaint.id}/history`,
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(historyRes.statusCode === 200, 'Status history endpoint returns HTTP 200');
    const transitions = historyRes.json?.data || [];
    assert(transitions.length >= 3, 'Audit timeline contains initial, In Progress, and Resolved transitions');
    const latestTransition = transitions[transitions.length - 1];
    assert(latestTransition?.toStatus === 'Resolved', 'Latest transition is to "Resolved"');
    assert(latestTransition?.remarks?.includes('pressure tested'), 'Remarks recorded accurately in audit log');

    // 34. Check Final Student Dashboard Stats
    const finalStudentStatsRes = await request({
      path: '/api/complaints/my/stats',
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(finalStudentStatsRes.json?.data?.resolvedCount >= 1, 'Student stats reflect resolvedCount >= 1');
    assert(finalStudentStatsRes.json?.data?.pendingCount === 0, 'Student stats reflect pendingCount back to 0');

  } catch (err) {
    console.error('Unexpected test execution failure:', err);
    failedTests++;
  } finally {
    if (server) {
      await new Promise((r) => server.close(r));
    }
    await closePool();

    console.log('\n======================================================');
    console.log(` Stage 8 Tests Completed: ${passedTests} Passed, ${failedTests} Failed `);
    console.log('======================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runTests();
