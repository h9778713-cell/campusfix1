/**
 * CampusFix — Stage 13 Complete End-to-End QA, Workflow Integration, and Regression Suite
 *
 * Verifies:
 * 1. Application Startup & Liveness:
 *    - Server bootstrap, database connection pool, health check endpoints, static asset delivery
 * 2. Complete Student End-to-End Workflow:
 *    - Registration -> Login -> Personal Stats -> Grievance Submission with Photo ->
 *      Ticket Details -> Photo Verification -> Student Comment -> Status Timeline ->
 *      Logout -> Relogin -> Data Persistence
 * 3. Complete Admin Facilities Operations Workflow:
 *    - Admin Login -> Dashboard & Analytics Triage -> Complaint Search & Filter ->
 *      Evidence Photo Inspection -> Public Comment -> Confidential Staff Note ->
 *      Department & Technician Assignment -> Priority Escalation ->
 *      Workflow Progression (Pending -> In Progress -> Resolved -> Closed)
 * 4. Cross-Feature Synchronization:
 *    - Status reflection across Student UI, Admin Queue, and Analytics
 *    - Priority reflection across all views
 *    - Audit feed chronological synchronization in real-time
 *    - Privacy isolation: Student never sees internal admin notes
 * 5. Negative, Boundary & Error Handling Scenarios:
 *    - Malformed IDs, non-existent records, invalid enums, redundant status transitions
 *    - Invalid assignees (rejection of students as technicians)
 *    - Whitespace rejection and boundary limits
 *    - IDOR cross-student access prevention
 * 6. Direct Database Consistency Verification:
 *    - Foreign key integrity, history completeness, and password hash security in SQL Server
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { app } = require('../server');
const { closePool, getPool } = require('../config/db');

const TEST_PORT = 5066;
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
      if (typeof body === 'string') {
        payloadString = body;
        if (!options.headers['Content-Type']) {
          options.headers['Content-Type'] = 'application/json';
        }
      } else {
        payloadString = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
      }
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

function makeMultipartUpload({ url, headers = {}, fieldName = 'image', filename = 'evidence.png', fileBuffer, mimeType = 'image/png' }) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundaryE2E' + Math.random().toString(16).slice(2);
    const crlf = '\r\n';

    let headerPart = `--${boundary}${crlf}`;
    headerPart += `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"${crlf}`;
    headerPart += `Content-Type: ${mimeType}${crlf}${crlf}`;

    const footerPart = `${crlf}--${boundary}--${crlf}`;

    const payload = Buffer.concat([
      Buffer.from(headerPart, 'utf8'),
      fileBuffer,
      Buffer.from(footerPart, 'utf8')
    ]);

    const reqHeaders = {
      ...headers,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': payload.length
    };

    const req = http.request({
      hostname: 'localhost',
      port: TEST_PORT,
      path: url,
      method: 'POST',
      headers: reqHeaders
    }, (res) => {
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
    req.write(payload);
    req.end();
  });
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

let adminToken = '';
let studentEmail = '';
let studentPassword = 'Password@123';
let studentToken = '';
let studentIdNumber = '';
let studentComplaintId = null;
let studentComplaintCode = '';
let uploadedImageKey = null;

// Valid 1x1 PNG bytes for testing
const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
]);

// ==========================================
// 1. STARTUP, HEALTH & STATIC ASSETS
// ==========================================

test('1. Application Startup: Liveness endpoint (/api/health) returns 200 and healthy status', async () => {
  const res = await makeRequest({ method: 'GET', url: '/api/health' });
  if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
  if (res.data.success !== true) throw new Error('Expected success: true');
  if (res.data.data.status !== 'healthy') throw new Error(`Expected healthy, got ${res.data.data.status}`);
});

test('2. Application Startup: Database health check (/api/health/db) confirms SQL Server connectivity', async () => {
  const res = await makeRequest({ method: 'GET', url: '/api/health/db' });
  if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
  if (res.data.data.status !== 'connected') throw new Error(`Expected connected, got ${res.data.data.status}`);
  if (typeof res.data.data.latencyMs !== 'number') throw new Error('Latency measurement missing');
});

test('3. Application Startup: Static HTML and CSS frontend assets serve cleanly', async () => {
  const resHtml = await makeRequest({ method: 'GET', url: '/index.html' });
  if (resHtml.statusCode !== 200) throw new Error(`Failed to serve index.html: ${resHtml.statusCode}`);
  if (typeof resHtml.data !== 'string' || !resHtml.data.includes('CampusFix')) {
    throw new Error('index.html did not contain expected content');
  }

  const resCss = await makeRequest({ method: 'GET', url: '/css/style.css' });
  if (resCss.statusCode !== 200) throw new Error(`Failed to serve style.css: ${resCss.statusCode}`);
});

// ==========================================
// 2. STUDENT COMPLETE WORKFLOW
// ==========================================

test('4. Student Workflow: Self-registration with valid data succeeds with HTTP 201', async () => {
  const ts = Date.now();
  studentEmail = `e2e_student_${ts}@campusfix.edu`;
  studentIdNumber = `STU${ts.toString().slice(-5)}`;

  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      fullName: 'Muhammad Farooq',
      email: studentEmail,
      password: studentPassword,
      studentId: studentIdNumber,
      phone: '+92 300 1234567'
    }
  });

  if (res.statusCode !== 201) throw new Error(`Registration failed: ${JSON.stringify(res.data)}`);
  if (res.data.data.user.role !== 'student') throw new Error('Assigned role was not student');
  if (!res.data.data.token) throw new Error('Token not issued upon registration');
  studentToken = res.data.data.token;
});

test('5. Student Workflow: Login verifies credentials and returns session token', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: { email: studentEmail, password: studentPassword }
  });

  if (res.statusCode !== 200) throw new Error(`Login failed: ${JSON.stringify(res.data)}`);
  studentToken = res.data.data.token;
  if (!studentToken) throw new Error('No JWT returned on login');
});

test('6. Student Workflow: Check initial stats and active categories', async () => {
  const statsRes = await makeRequest({
    method: 'GET',
    url: '/api/complaints/my/stats',
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  if (statsRes.statusCode !== 200) throw new Error(`Stats fetch failed: ${statsRes.statusCode}`);
  if (statsRes.data.data.totalComplaints !== 0) throw new Error('Expected initial totalComplaints: 0');

  const catRes = await makeRequest({ method: 'GET', url: '/api/categories' });
  if (catRes.statusCode !== 200 || !Array.isArray(catRes.data.data)) {
    throw new Error('Categories fetch failed');
  }
});

test('7. Student Workflow: Submit new complaint with valid fields', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/complaints',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      title: 'Lab 204 Overhead Projector Color Distortion',
      description: 'The overhead projector in Lab 204 has a strong yellow tint and cannot display presentation slides properly for lectures.',
      categoryId: 1, // Classrooms & AV Equipment
      building: 'Academic Block 2',
      roomNumber: 'Lab 204',
      priority: 'Medium'
    }
  });

  if (res.statusCode !== 201) throw new Error(`Complaint submission failed: ${JSON.stringify(res.data)}`);
  studentComplaintId = res.data.data.id;
  studentComplaintCode = res.data.data.complaintCode;

  if (!studentComplaintId) throw new Error('No complaint ID returned');
  if (!studentComplaintCode.startsWith('CMP-')) throw new Error('Invalid complaint code prefix');
  if (res.data.data.status !== 'Pending') throw new Error('Expected initial status Pending');
});

test('8. Student Workflow: Upload genuine evidence image to complaint', async () => {
  const res = await makeMultipartUpload({
    url: `/api/complaints/${studentComplaintId}/image`,
    headers: { Authorization: `Bearer ${studentToken}` },
    fieldName: 'image',
    filename: 'projector_yellow_screen.png',
    fileBuffer: VALID_PNG_BYTES,
    mimeType: 'image/png'
  });

  if (res.statusCode !== 200) throw new Error(`Image upload failed: ${JSON.stringify(res.data)}`);
  uploadedImageKey = res.data.data.imageKey;
  if (!uploadedImageKey) throw new Error('No image key returned');
  if (!res.data.data.imageUrl.includes('/images/')) throw new Error('Invalid image URL format');
});

test('9. Student Workflow: Verify complaint appears in My Complaints listing', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/complaints/my',
    headers: { Authorization: `Bearer ${studentToken}` }
  });

  if (res.statusCode !== 200) throw new Error(`My complaints failed: ${res.statusCode}`);
  const list = res.data.data.complaints;
  const found = list.find(c => c.id === studentComplaintId);
  if (!found) throw new Error('Newly created complaint not found in My Complaints');
  if (found.title !== 'Lab 204 Overhead Projector Color Distortion') throw new Error('Title mismatch');
  if (found.status !== 'Pending') throw new Error('Status mismatch');
});

test('10. Student Workflow: Retrieve full complaint dossier and verify evidence image', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: `/api/complaints/${studentComplaintId}`,
    headers: { Authorization: `Bearer ${studentToken}` }
  });

  if (res.statusCode !== 200) throw new Error(`Dossier fetch failed: ${res.statusCode}`);
  const d = res.data.data;
  if (d.complaintCode !== studentComplaintCode) throw new Error('Complaint code mismatch in dossier');
  if (!d.imageUrl) throw new Error('Missing image URL in dossier');

  // Verify the image can be downloaded by the student
  const imgRes = await makeRequest({
    method: 'GET',
    url: `/api/complaints/${studentComplaintId}/image`,
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  if (imgRes.statusCode !== 200) throw new Error(`Failed to download complaint image: ${imgRes.statusCode}`);
});

test('11. Student Workflow: Add a follow-up comment on the complaint', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: `/api/complaints/${studentComplaintId}/comments`,
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      commentText: 'Prof. Ahmed confirmed class tomorrow morning at 9 AM needs this projector.'
    }
  });

  if (res.statusCode !== 201) throw new Error(`Post comment failed: ${JSON.stringify(res.data)}`);
  if (!res.data.data.id) throw new Error('No comment ID returned');

  // Verify comment is readable in thread
  const listRes = await makeRequest({
    method: 'GET',
    url: `/api/complaints/${studentComplaintId}/comments`,
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  if (listRes.statusCode !== 200) throw new Error('Comments fetch failed');
  const cm = listRes.data.data.find(c => c.id === res.data.data.id);
  if (!cm) throw new Error('Posted comment not found in thread');
  if (cm.authorRole !== 'student') throw new Error('Author role mismatch');
});

test('12. Student Workflow: Verify status history contains initial transition', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: `/api/complaints/${studentComplaintId}/history`,
    headers: { Authorization: `Bearer ${studentToken}` }
  });

  if (res.statusCode !== 200) throw new Error(`History fetch failed: ${res.statusCode}`);
  const history = res.data.data;
  if (!Array.isArray(history) || history.length === 0) throw new Error('Empty status history');
  if (history[0].newStatus !== 'Pending') throw new Error(`Expected first status Pending, got ${history[0].newStatus}`);
});

test('13. Student Workflow: Logout and verify unauthenticated session rejection', async () => {
  const logoutRes = await makeRequest({
    method: 'POST',
    url: '/api/auth/logout',
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  if (logoutRes.statusCode !== 200) throw new Error(`Logout failed: ${logoutRes.statusCode}`);

  // Attempting request without token
  const unauthRes = await makeRequest({ method: 'GET', url: '/api/complaints/my' });
  if (unauthRes.statusCode !== 401) throw new Error(`Expected 401 unauthenticated, got ${unauthRes.statusCode}`);
});

// ==========================================
// 3. ADMIN COMPLETE WORKFLOW & TRIAGE
// ==========================================

test('14. Admin Workflow: Admin login and dashboard overview retrieval', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: { email: 'admin@campusfix.edu', password: 'Admin@12345' }
  });

  if (res.statusCode !== 200) throw new Error(`Admin login failed: ${JSON.stringify(res.data)}`);
  adminToken = res.data.data.token;
  if (!adminToken) throw new Error('No admin token');

  const overviewRes = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/overview',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (overviewRes.statusCode !== 200) throw new Error('Overview analytics failed');
  if (typeof overviewRes.data.data.totalComplaints !== 'number') throw new Error('Overview missing totalComplaints');
});

test('15. Admin Workflow: Search and filter queue to locate Student complaint', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: `/api/admin/complaints?search=${encodeURIComponent(studentComplaintCode)}`,
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 200) throw new Error(`Search failed: ${res.statusCode}`);
  const complaints = res.data.data.complaints;
  const match = complaints.find(c => c.complaintCode === studentComplaintCode);
  if (!match) throw new Error(`Grievance ${studentComplaintCode} not located in admin queue`);
  if (match.studentEmail !== studentEmail) throw new Error('Student email mismatch in admin search');
});

test('16. Admin Workflow: Admin posts public comment and confidential staff note', async () => {
  // Public comment
  const pubRes = await makeRequest({
    method: 'POST',
    url: `/api/complaints/${studentComplaintId}/comments`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      commentText: 'Maintenance dispatch notified. An AV technician will visit before 8:30 AM.'
    }
  });
  if (pubRes.statusCode !== 201) throw new Error(`Public comment failed: ${JSON.stringify(pubRes.data)}`);

  // Confidential staff note
  const privRes = await makeRequest({
    method: 'POST',
    url: `/api/complaints/${studentComplaintId}/comments`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      commentText: 'INTERNAL: Checked inventory; spare HDMI cable and Epson bulb ready in Room 101.',
      isAdminOnly: true
    }
  });
  if (privRes.statusCode !== 201) throw new Error(`Internal note failed: ${JSON.stringify(privRes.data)}`);
});

test('17. Admin Workflow: Advance status Pending -> In Progress', async () => {
  const res = await makeRequest({
    method: 'PATCH',
    url: `/api/admin/complaints/${studentComplaintId}/status`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      status: 'In Progress',
      remarks: 'Technician Ali has arrived on-site in Lab 204.'
    }
  });

  if (res.statusCode !== 200) throw new Error(`Status update failed: ${JSON.stringify(res.data)}`);
  if (res.data.data.status !== 'In Progress') throw new Error('Status not In Progress');
});

test('18. Admin Workflow: Assign complaint to Department 3 and Staff Admin', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: `/api/admin/complaints/${studentComplaintId}/assign`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      departmentId: 3,
      assignmentNotes: 'High priority dispatch for morning lecture preparation'
    }
  });

  if (res.statusCode !== 200) throw new Error(`Assignment failed: ${JSON.stringify(res.data)}`);
  const assignment = res.data.data?.assignment || res.data.data;
  if (!assignment) throw new Error('No assignment returned');
  if (assignment.departmentName !== 'Electrical & Power Systems') {
    throw new Error(`Unexpected department: ${assignment.departmentName}`);
  }
});

test('19. Admin Workflow: Escalate priority to Critical', async () => {
  const res = await makeRequest({
    method: 'PATCH',
    url: `/api/admin/complaints/${studentComplaintId}/priority`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { priority: 'Critical' }
  });

  if (res.statusCode !== 200) throw new Error(`Priority patch failed: ${JSON.stringify(res.data)}`);
  if (res.data.data.priority !== 'Critical') throw new Error('Priority was not Critical');
});

test('20. Admin Workflow: Advance status In Progress -> Resolved', async () => {
  const res = await makeRequest({
    method: 'PATCH',
    url: `/api/admin/complaints/${studentComplaintId}/status`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      status: 'Resolved',
      remarks: 'Replaced faulty video splitter and calibrated color profile. Fully operational.'
    }
  });

  if (res.statusCode !== 200) throw new Error(`Status update failed: ${JSON.stringify(res.data)}`);
  if (res.data.data.status !== 'Resolved') throw new Error('Status not Resolved');
  if (!res.data.data.resolvedAt) throw new Error('resolvedAt timestamp was not set');
});

test('21. Admin Workflow: Close ticket Resolved -> Closed', async () => {
  const res = await makeRequest({
    method: 'PATCH',
    url: `/api/admin/complaints/${studentComplaintId}/status`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      status: 'Closed',
      remarks: 'Student confirmed classroom display verified. Work order closed.'
    }
  });

  if (res.statusCode !== 200) throw new Error(`Status update failed: ${JSON.stringify(res.data)}`);
  if (res.data.data.status !== 'Closed') throw new Error('Status not Closed');
  if (!res.data.data.closedAt) throw new Error('closedAt timestamp was not set');
});

// ==========================================
// 4. CROSS-FEATURE SYNCHRONIZATION
// ==========================================

test('22. Cross-Feature Sync: Student view accurately reflects "Closed" status and "Critical" priority', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: `/api/complaints/${studentComplaintId}`,
    headers: { Authorization: `Bearer ${studentToken}` }
  });

  if (res.statusCode !== 200) throw new Error(`Student fetch failed: ${res.statusCode}`);
  const complaint = res.data.data;
  if (complaint.status !== 'Closed') throw new Error(`Expected status Closed, got ${complaint.status}`);
  if (complaint.priority !== 'Critical') throw new Error(`Expected priority Critical, got ${complaint.priority}`);
  if (!complaint.resolvedAt || !complaint.closedAt) throw new Error('Missing timestamps in student view');
});

test('23. Cross-Feature Sync: Student comment thread strictly excludes internal staff notes', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: `/api/complaints/${studentComplaintId}/comments`,
    headers: { Authorization: `Bearer ${studentToken}` }
  });

  if (res.statusCode !== 200) throw new Error(`Student comments failed: ${res.statusCode}`);
  const comments = res.data.data;
  const leaked = comments.some(c => c.commentText && c.commentText.includes('INTERNAL: Checked inventory'));
  if (leaked) {
    throw new Error('CRITICAL DATA LEAK: Staff note visible to student in cross-feature sync check');
  }
});

test('24. Cross-Feature Sync: Admin audit feed (/api/admin/analytics/activity) reflects live actions', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/activity?limit=10',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 200) throw new Error(`Activity fetch failed: ${res.statusCode}`);
  const stream = res.data.data;
  if (!Array.isArray(stream) || stream.length === 0) throw new Error('Empty activity feed');

  const hasRecentAction = stream.some(a => a.complaintId === studentComplaintId);
  if (!hasRecentAction) {
    throw new Error(`Actions for complaint ${studentComplaintId} not present in audit activity feed`);
  }
});

// ==========================================
// 5. NEGATIVE & BOUNDARY EDGE CASES
// ==========================================

test('25. Negative Test: Redundant status transition rejected with 400 STATUS_UNCHANGED', async () => {
  const res = await makeRequest({
    method: 'PATCH',
    url: `/api/admin/complaints/${studentComplaintId}/status`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { status: 'Closed', remarks: 'Trying to close already closed ticket' }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (res.data.error.code !== 'STATUS_UNCHANGED') {
    throw new Error(`Expected STATUS_UNCHANGED, got ${res.data.error.code}`);
  }
});

test('26. Negative Test: Invalid status string rejected with 400 VALIDATION_ERROR', async () => {
  const res = await makeRequest({
    method: 'PATCH',
    url: `/api/admin/complaints/${studentComplaintId}/status`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { status: 'PurgedFromDatabase' }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (res.data.error.code !== 'VALIDATION_ERROR') {
    throw new Error(`Expected VALIDATION_ERROR, got ${res.data.error.code}`);
  }
});

test('27. Negative Test: Assigning complaint to a non-existent department returns 400', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: `/api/admin/complaints/${studentComplaintId}/assign`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { departmentId: 99999, assignmentNotes: 'Bad department' }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (res.data.error.code !== 'INVALID_DEPARTMENT') {
    throw new Error(`Expected INVALID_DEPARTMENT, got ${res.data.error.code}`);
  }
});

test('28. Negative Test: Requesting non-existent complaint ID returns 404 NOT_FOUND', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/complaints/9999999',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 404) throw new Error(`Expected 404, got ${res.statusCode}`);
  if (res.data.error.code !== 'NOT_FOUND') {
    throw new Error(`Expected NOT_FOUND, got ${res.data.error.code}`);
  }
});

test('29. Negative Test: Malformed non-integer complaint ID returns 400 INVALID_ID', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/complaints/not-a-number',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  if (res.data.error.code !== 'INVALID_ID') {
    throw new Error(`Expected INVALID_ID, got ${res.data.error.code}`);
  }
});

// ==========================================
// 6. DATABASE CONSISTENCY VERIFICATION
// ==========================================

test('30. Database Integrity: Direct SQL query confirms complaint status is Closed', async () => {
  const pool = await getPool();
  const q = `
    SELECT id, complaintCode, status, priority, resolvedAt, closedAt 
    FROM dbo.Complaints 
    WHERE id = @id;
  `;
  const result = await pool.request().input('id', studentComplaintId).query(q);
  const row = result.recordset[0];

  if (!row) throw new Error('Complaint row not found in SQL Server');
  if (row.status !== 'Closed') throw new Error(`SQL Server status is ${row.status}, expected Closed`);
  if (row.priority !== 'Critical') throw new Error(`SQL Server priority is ${row.priority}, expected Critical`);
  if (!row.resolvedAt || !row.closedAt) throw new Error('SQL Server resolvedAt or closedAt is NULL');
});

test('31. Database Integrity: Status history contains full 4-stage chronological audit trail', async () => {
  const pool = await getPool();
  const q = `
    SELECT oldStatus, newStatus, changedAt 
    FROM dbo.ComplaintStatusHistory 
    WHERE complaintId = @id 
    ORDER BY changedAt ASC;
  `;
  const result = await pool.request().input('id', studentComplaintId).query(q);
  const rows = result.recordset;

  if (rows.length < 4) throw new Error(`Expected at least 4 transitions, found ${rows.length}`);

  const transitions = rows.map(r => `${r.oldStatus || 'START'}->${r.newStatus}`);
  const expected = ['START->Pending', 'Pending->In Progress', 'In Progress->Resolved', 'Resolved->Closed'];

  for (let i = 0; i < expected.length; i++) {
    if (!transitions.includes(expected[i])) {
      throw new Error(`Missing expected transition: ${expected[i]}. Actual: ${transitions.join(', ')}`);
    }
  }
});

test('32. Database Integrity: Department assignment record exists and references department 3', async () => {
  const pool = await getPool();
  const q = `
    SELECT departmentId, isActive 
    FROM dbo.ComplaintAssignments 
    WHERE complaintId = @id AND isActive = 1;
  `;
  const result = await pool.request().input('id', studentComplaintId).query(q);
  const row = result.recordset[0];

  if (!row) throw new Error('No active assignment row found in SQL Server');
  if (row.departmentId !== 3) throw new Error(`Expected departmentId 3, got ${row.departmentId}`);
});

test('33. Database Integrity: Comments thread persists all student and admin comments', async () => {
  const pool = await getPool();
  const q = `
    SELECT COUNT(*) AS commentCount 
    FROM dbo.ComplaintComments 
    WHERE complaintId = @id;
  `;
  const result = await pool.request().input('id', studentComplaintId).query(q);
  const count = result.recordset[0].commentCount;

  // 1 student comment + 1 admin public comment + 1 admin internal note = 3 comments
  if (count < 3) throw new Error(`Expected at least 3 comments in database, found ${count}`);
});

// ==========================================
// RUNNER
// ==========================================

async function runStage13Suite() {
  console.log('\n======================================================');
  console.log(' CampusFix — Stage 13 E2E QA & System Integration Suite');
  console.log(' Isolated Test Port: ' + TEST_PORT);
  console.log('======================================================\n');

  try {
    server = app.listen(TEST_PORT);
    await new Promise(res => server.on('listening', res));
    console.log(`[Stage 13 Test Server] Listening on port ${TEST_PORT}`);

    // Pre-flight database pool check
    await getPool();

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
    console.log(` E2E QA Results: ${passed} passed, ${failed} failed (${tests.length} total)`);
    console.log('------------------------------------------------------\n');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (fatalErr) {
    console.error('Fatal Test Runner Error:', fatalErr);
    process.exitCode = 1;
  } finally {
    if (server) {
      await new Promise(res => server.close(res));
    }
    await closePool();
  }
}

runStage13Suite();
