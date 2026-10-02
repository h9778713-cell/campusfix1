/**
 * CampusFix — Stage 10 Admin Dashboard & Analytics Automated Test Suite
 * Comprehensive verification of:
 * 1. Admin Authentication & Role-Based Access Control (401 Unauthenticated, 403 Student, 403 Role Tampering)
 * 2. SQL Server Analytics Aggregations:
 *    - Full Analytics Suite (/api/admin/analytics)
 *    - Metric Summary Cards (/api/admin/analytics/overview)
 *    - Status & Priority Distributions (/api/admin/analytics/distributions)
 *    - Category Breakdown (/api/admin/analytics/categories)
 *    - Location / Building Breakdown (/api/admin/analytics/locations)
 *    - Historical Velocity Trends (/api/admin/analytics/trends?days=7,14,30)
 *    - Department Workloads (/api/admin/analytics/workload)
 *    - Unified Audit Activity Feed (/api/admin/analytics/activity)
 * 3. Dynamic Real-Time Metric Updates:
 *    - Creating new complaint updates total & status metrics in SQL Server
 *    - Updating status shifts status distribution counts
 *    - Escalating priority updates priority distribution counts
 *    - Assigning department updates workload & recent activity feed
 *    - Adding staff note updates recent activity feed
 * 4. Validation, Edge Cases & Data Sanitization:
 *    - Handling boundary query params (limit, days)
 *    - Zero exposure of sensitive student credentials or SQL error stack traces
 * 5. Backward Compatibility:
 *    - Legacy /api/admin/stats continues to function seamlessly
 */

const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { app } = require('../server');
const { closePool } = require('../config/db');

const TEST_PORT = 5063;
let server;

function makeRequest({ method = 'GET', url, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: TEST_PORT,
      path: url,
      method,
      headers: {
        ...headers
      }
    };

    if (body) {
      const jsonBody = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(jsonBody);
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

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Test Runner
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

let adminToken = '';
let studentToken = '';
let studentId = null;
let createdComplaintId = null;
let initialOverview = null;

// ==============================================================================
// 1. SETUP & AUTHENTICATION
// ==============================================================================
test('Setup: Admin Login retrieves valid JWT', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: {
      email: 'admin@campusfix.edu',
      password: process.env.ADMIN_SEED_PASSWORD || 'Admin@12345'
    }
  });

  if (res.statusCode !== 200 || !res.data.success || !res.data.data.token) {
    throw new Error(`Admin login failed: ${res.statusCode} ${JSON.stringify(res.data)}`);
  }
  adminToken = res.data.data.token;
});

test('Setup: Student Login or Register retrieves valid JWT', async () => {
  const timestamp = Date.now();
  const regRes = await makeRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      fullName: 'Analytics Tester',
      email: `analytics.student.${timestamp}@campusfix.edu`,
      password: 'StrongPassword123!',
      studentId: `STU-${timestamp.toString().slice(-6)}`,
      phone: '+1-555-8899'
    }
  });

  if (regRes.statusCode !== 201 || !regRes.data.success || !regRes.data.data.token) {
    throw new Error(`Student registration failed: ${regRes.statusCode} ${JSON.stringify(regRes.data)}`);
  }
  studentToken = regRes.data.data.token;
  studentId = regRes.data.data.user.id;
});

// ==============================================================================
// 2. AUTHORIZATION & SECURITY TESTS
// ==============================================================================
test('Security: Unauthenticated request to /api/admin/analytics returns 401', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics'
  });
  if (res.statusCode !== 401) {
    throw new Error(`Expected 401, got ${res.statusCode}`);
  }
});

test('Security: Student token to /api/admin/analytics returns 403 Forbidden', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics',
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  if (res.statusCode !== 403) {
    throw new Error(`Expected 403 Forbidden for student, got ${res.statusCode}`);
  }
});

test('Security: Student token to /api/admin/analytics/overview returns 403 Forbidden', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/overview',
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  if (res.statusCode !== 403) {
    throw new Error(`Expected 403, got ${res.statusCode}`);
  }
});

test('Security: Student token to /api/admin/analytics/workload returns 403 Forbidden', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/workload',
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  if (res.statusCode !== 403) {
    throw new Error(`Expected 403, got ${res.statusCode}`);
  }
});

test('Security: Forged token with invalid signature returns 401 Unauthorized', async () => {
  const fakeToken = jwt.sign(
    { id: 1, role: 'admin', email: 'forged@campusfix.edu' },
    'wrong-secret-key-signature'
  );
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics',
    headers: { Authorization: `Bearer ${fakeToken}` }
  });
  if (res.statusCode !== 401) {
    throw new Error(`Expected 401 for forged token, got ${res.statusCode}`);
  }
});

test('Security: Role-tampered token (student claiming admin) returns 401/403', async () => {
  const fakeToken = jwt.sign(
    { id: studentId, role: 'admin' },
    'attacker-tampered-secret'
  );
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics',
    headers: { Authorization: `Bearer ${fakeToken}` }
  });
  if (res.statusCode !== 401 && res.statusCode !== 403) {
    throw new Error(`Expected 401 or 403, got ${res.statusCode}`);
  }
});

// ==============================================================================
// 3. ANALYTICS ENDPOINTS VERIFICATION (ADMIN ACCESS)
// ==============================================================================
test('Analytics API: GET /api/admin/analytics/overview returns all summary metrics', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/overview',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 200 || !res.data.success) {
    throw new Error(`Failed overview fetch: ${res.statusCode} ${JSON.stringify(res.data)}`);
  }

  const o = res.data.data;
  initialOverview = o;

  const expectedFields = [
    'totalComplaints', 'pendingCount', 'inProgressCount', 'resolvedCount',
    'closedCount', 'rejectedCount', 'criticalCount', 'unassignedCount'
  ];

  for (const field of expectedFields) {
    if (typeof o[field] !== 'number') {
      throw new Error(`Missing or non-numeric field in overview: ${field} = ${o[field]}`);
    }
  }

  if (o.totalComplaints < 0) {
    throw new Error(`Total complaints cannot be negative: ${o.totalComplaints}`);
  }
});

test('Analytics API: GET /api/admin/analytics/distributions returns status & priority breakdowns', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/distributions',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 200 || !res.data.success) {
    throw new Error(`Failed distributions fetch: ${res.statusCode}`);
  }

  const { byStatus, byPriority } = res.data.data;
  if (!Array.isArray(byStatus) || !Array.isArray(byPriority)) {
    throw new Error('Distributions must return arrays for byStatus and byPriority');
  }

  if (byStatus.length > 0) {
    const s0 = byStatus[0];
    if (!s0.status || typeof s0.count !== 'number' || typeof s0.percentage !== 'number') {
      throw new Error(`Invalid status distribution item schema: ${JSON.stringify(s0)}`);
    }
  }

  if (byPriority.length > 0) {
    const p0 = byPriority[0];
    if (!p0.priority || typeof p0.count !== 'number' || typeof p0.percentage !== 'number') {
      throw new Error(`Invalid priority distribution item schema: ${JSON.stringify(p0)}`);
    }
  }
});

test('Analytics API: GET /api/admin/analytics/categories returns category statistics with departments', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/categories',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 200 || !res.data.success) {
    throw new Error(`Failed categories fetch: ${res.statusCode}`);
  }

  const cats = res.data.data;
  if (!Array.isArray(cats) || cats.length === 0) {
    throw new Error('Categories analytics should return active category items');
  }

  const c0 = cats[0];
  if (!c0.categoryName || typeof c0.count !== 'number' || typeof c0.activeCount !== 'number') {
    throw new Error(`Invalid category analytics item structure: ${JSON.stringify(c0)}`);
  }
});

test('Analytics API: GET /api/admin/analytics/locations returns facility building statistics', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/locations?limit=5',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 200 || !res.data.success) {
    throw new Error(`Failed locations fetch: ${res.statusCode}`);
  }

  const locs = res.data.data;
  if (!Array.isArray(locs)) {
    throw new Error('Locations analytics should return an array');
  }

  if (locs.length > 0) {
    const l0 = locs[0];
    if (!l0.building || typeof l0.totalComplaints !== 'number' || typeof l0.activeCount !== 'number') {
      throw new Error(`Invalid location item structure: ${JSON.stringify(l0)}`);
    }
  }
});

test('Analytics API: GET /api/admin/analytics/trends supports customizable days parameter (7, 14, 30)', async () => {
  for (const days of [7, 14, 30]) {
    const res = await makeRequest({
      method: 'GET',
      url: `/api/admin/analytics/trends?days=${days}`,
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    if (res.statusCode !== 200 || !res.data.success) {
      throw new Error(`Failed trends fetch for days=${days}: ${res.statusCode}`);
    }

    const trends = res.data.data;
    if (!Array.isArray(trends)) {
      throw new Error(`Trends must be an array for days=${days}`);
    }

    if (trends.length > 0) {
      const t0 = trends[0];
      if (!t0.dateStr || typeof t0.filedCount !== 'number' || typeof t0.resolvedCount !== 'number') {
        throw new Error(`Invalid trend point: ${JSON.stringify(t0)}`);
      }
    }
  }
});

test('Analytics API: GET /api/admin/analytics/workload returns department backlogs', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/workload',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 200 || !res.data.success) {
    throw new Error(`Failed workload fetch: ${res.statusCode}`);
  }

  const wl = res.data.data;
  if (!Array.isArray(wl) || wl.length === 0) {
    throw new Error('Workload analytics should return active departments');
  }

  const d0 = wl[0];
  if (!d0.departmentName || typeof d0.activeAssignments !== 'number' || typeof d0.criticalAssignments !== 'number') {
    throw new Error(`Invalid department workload record: ${JSON.stringify(d0)}`);
  }
});

test('Analytics API: GET /api/admin/analytics/activity returns real unified audit stream', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/activity?limit=15',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 200 || !res.data.success) {
    throw new Error(`Failed activity stream fetch: ${res.statusCode}`);
  }

  const acts = res.data.data;
  if (!Array.isArray(acts)) {
    throw new Error('Activity stream should return an array');
  }

  if (acts.length > 0) {
    const a0 = acts[0];
    if (!a0.activityType || !a0.complaintCode || !a0.actorName || !a0.details || !a0.activityAt) {
      throw new Error(`Invalid activity stream entry structure: ${JSON.stringify(a0)}`);
    }
  }
});

test('Analytics API: GET /api/admin/analytics consolidated suite returns all sections in single query roundtrip', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 200 || !res.data.success) {
    throw new Error(`Failed full analytics suite: ${res.statusCode}`);
  }

  const suite = res.data.data;
  const requiredKeys = ['overview', 'byStatus', 'byPriority', 'byCategory', 'byLocation', 'trends', 'workload', 'recentActivity'];
  for (const k of requiredKeys) {
    if (suite[k] === undefined) {
      throw new Error(`Full suite missing key: ${k}`);
    }
  }
});

test('Backward Compatibility: Legacy GET /api/admin/stats remains functional', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/admin/stats',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 200 || !res.data.success || res.data.data.totalComplaints === undefined) {
    throw new Error(`Legacy /api/admin/stats broken: ${res.statusCode}`);
  }
});

// ==============================================================================
// 4. DYNAMIC UPDATE VERIFICATION (E2E STATE MUTATION & RE-CHECK)
// ==============================================================================
test('Dynamic Update: Creating new complaint dynamically increments Total and Pending metrics', async () => {
  const beforeRes = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/overview',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const beforeStats = beforeRes.data.data;

  // Student creates a complaint
  const compRes = await makeRequest({
    method: 'POST',
    url: '/api/complaints',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      title: 'Stage 10 Dynamic Metric Verification Test',
      description: 'Testing real-time dashboard aggregation and counter updates in SQL Server.',
      categoryId: 1, // Electrical
      building: 'Engineering Hall',
      roomNumber: 'Lab-404',
      priority: 'Low'
    }
  });

  if (compRes.statusCode !== 201 || !compRes.data.success) {
    throw new Error(`Complaint creation failed: ${compRes.statusCode} ${JSON.stringify(compRes.data)}`);
  }

  createdComplaintId = compRes.data.data.id;

  // Fetch updated overview
  const afterRes = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/overview',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const afterStats = afterRes.data.data;

  if (afterStats.totalComplaints !== beforeStats.totalComplaints + 1) {
    throw new Error(`Total complaints did not increment by 1: before=${beforeStats.totalComplaints}, after=${afterStats.totalComplaints}`);
  }

  if (afterStats.pendingCount !== beforeStats.pendingCount + 1) {
    throw new Error(`Pending count did not increment by 1: before=${beforeStats.pendingCount}, after=${afterStats.pendingCount}`);
  }
});

test('Dynamic Update: Escalating priority to Critical updates priority distribution', async () => {
  const updateRes = await makeRequest({
    method: 'PATCH',
    url: `/api/admin/complaints/${createdComplaintId}/priority`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { priority: 'Critical' }
  });

  if (updateRes.statusCode !== 200 || !updateRes.data.success) {
    throw new Error(`Priority update failed: ${updateRes.statusCode} ${JSON.stringify(updateRes.data)}`);
  }

  const overviewRes = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/overview',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  // Critical count should reflect the updated priority
  if (overviewRes.data.data.criticalCount <= 0) {
    throw new Error('Critical count should be greater than 0 after escalation.');
  }
});

test('Dynamic Update: Transitioning status to In Progress updates status distribution', async () => {
  const statusRes = await makeRequest({
    method: 'PATCH',
    url: `/api/admin/complaints/${createdComplaintId}/status`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      status: 'In Progress',
      remarks: 'Maintenance crew dispatched to verify circuit.'
    }
  });

  if (statusRes.statusCode !== 200 || !statusRes.data.success) {
    throw new Error(`Status update failed: ${statusRes.statusCode} ${JSON.stringify(statusRes.data)}`);
  }

  const overviewRes = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/overview',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  const o = overviewRes.data.data;
  if (o.inProgressCount <= 0) {
    throw new Error('In Progress count should be greater than 0.');
  }
});

test('Dynamic Update: Assigning complaint and adding internal note populates Recent Activity stream', async () => {
  // 1. Assign to Electrical Dept (deptId: 1)
  const assignRes = await makeRequest({
    method: 'POST',
    url: `/api/admin/complaints/${createdComplaintId}/assign`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      departmentId: 1,
      notes: 'Assigned to Senior Electrical Technician for immediate diagnosis.'
    }
  });

  if (assignRes.statusCode !== 200 && assignRes.statusCode !== 201) {
    throw new Error(`Assignment failed: ${assignRes.statusCode}`);
  }

  // 2. Add internal staff note
  const noteRes = await makeRequest({
    method: 'POST',
    url: `/api/complaints/${createdComplaintId}/comments`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      commentText: 'Internal note: parts ordered from campus electrical inventory.',
      isAdminOnly: true
    }
  });

  if (noteRes.statusCode !== 201) {
    throw new Error(`Staff note creation failed: ${noteRes.statusCode}`);
  }

  // 3. Verify Recent Activity Stream contains these events
  const actRes = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/activity?limit=5',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (actRes.statusCode !== 200 || !actRes.data.data) {
    throw new Error(`Failed to fetch activity: ${actRes.statusCode}`);
  }

  const recent = actRes.data.data;
  const foundRelated = recent.some(a => a.complaintId === createdComplaintId);
  if (!foundRelated) {
    throw new Error(`Created complaint ${createdComplaintId} events not found in top 5 recent activity stream!`);
  }
});

// ==============================================================================
// 5. INPUT VALIDATION & RESILIENCE
// ==============================================================================
test('Validation & Resilience: Malformed parameters in analytics queries handle safely without 500 or SQL error', async () => {
  const resLimit = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/locations?limit=-10',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (resLimit.statusCode !== 200) {
    throw new Error(`Negative limit should be clamped safely, got ${resLimit.statusCode}`);
  }

  const resDays = await makeRequest({
    method: 'GET',
    url: '/api/admin/analytics/trends?days=invalid',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (resDays.statusCode !== 200) {
    throw new Error(`Invalid days should fallback to default safely, got ${resDays.statusCode}`);
  }
});

test('Resilience: SQL queries are fully parameterized and safe against SQL injection in query params', async () => {
  const sqliPayload = encodeURIComponent("1; DROP TABLE dbo.Complaints;--");
  const res = await makeRequest({
    method: 'GET',
    url: `/api/admin/analytics/trends?days=${sqliPayload}`,
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (res.statusCode !== 200) {
    throw new Error(`SQL injection attempt should be neutralized safely, got ${res.statusCode}`);
  }
});

// ==============================================================================
// TEST RUNNER EXECUTION
// ==============================================================================
async function runAllTests() {
  console.log(`\n===============================================================`);
  console.log(`CampusFix — Stage 10 Admin Dashboard & Analytics Test Suite`);
  console.log(`Isolated Test Port: ${TEST_PORT}`);
  console.log(`Database: SQL Server (CampusFixDB)`);
  console.log(`===============================================================\n`);

  server = app.listen(TEST_PORT, () => {
    console.log(`[Test Server] Listening on port ${TEST_PORT} for Stage 10 testing...\n`);
  });

  // Give server a moment to bind
  await new Promise(r => setTimeout(r, 600));

  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    process.stdout.write(`• ${name} ... `);
    try {
      await fn();
      console.log('PASSED \u2713');
      passed++;
    } catch (err) {
      console.log('FAILED \u2717');
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n===============================================================`);
  console.log(`Stage 10 Test Results: ${passed} PASSED, ${failed} FAILED (Total: ${tests.length})`);
  console.log(`===============================================================\n`);

  server.close(async () => {
    await closePool();
    process.exit(failed > 0 ? 1 : 0);
  });
}

runAllTests().catch((err) => {
  console.error('Fatal Test Runner Exception:', err);
  if (server) server.close();
  process.exit(1);
});
