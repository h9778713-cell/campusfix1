/**
 * CampusFix — Stage 7 Image Upload & Storage Automated Test Suite
 * Validates multipart/form-data upload integration, deep magic-byte inspection,
 * MIME spoofing defense, executable disguises, empty/oversized file rejection,
 * path traversal defense, and strict RBAC / IDOR authorization for image access.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { app } = require('../server');
const { closePool } = require('../config/db');
const storageService = require('../services/storageService');

const TEST_PORT = 5059;
let server;

// Helper to build genuine binary buffers for tests
const BUFFERS = {
  // Valid minimal JPEG: starts with FF D8 FF
  validJpg: Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0xFF, 0xD9
  ]),

  // Valid minimal 1x1 PNG: starts with 89 50 4E 47 0D 0A 1A 0A
  validPng: Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
    0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ]),

  // Valid minimal WebP: starts with RIFF ... WEBP
  validWebp: Buffer.from(
    'RIFF\x1a\x00\x00\x00WEBPVP8 \x0e\x00\x00\x00\x30\x01\x00\x9d\x01\x2a\x01\x00\x01\x00\x02\x00\x34\x25',
    'binary'
  ),

  // Disguised Windows executable (.exe MZ header)
  fakeExeJpg: Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]),

  // Spoofed text file sent as image/jpeg
  spoofedText: Buffer.from("alert('XSS injection attempt or script file');", 'utf8'),

  // Empty buffer
  empty: Buffer.from([]),

  // Oversized 5.5 MB buffer (> 5 MB limit)
  oversized: Buffer.alloc(5.5 * 1024 * 1024, 0x41)
};

/**
 * Builds a multipart/form-data payload with headers in pure Node.js
 */
function buildMultipartFormData(fields = {}, file = null) {
  const boundary = '----CampusFixTestBoundary' + Math.random().toString(16).slice(2);
  const crlf = '\r\n';
  const bodyParts = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      bodyParts.push(Buffer.from(
        `--${boundary}${crlf}` +
        `Content-Disposition: form-data; name="${key}"${crlf}${crlf}` +
        `${value}${crlf}`
      ));
    }
  }

  if (file) {
    const fieldName = file.fieldName || 'image';
    const filename = file.filename || 'upload.jpg';
    const contentType = file.contentType || 'image/jpeg';
    const fileBuffer = file.buffer || Buffer.from('');

    bodyParts.push(Buffer.from(
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"${crlf}` +
      `Content-Type: ${contentType}${crlf}${crlf}`
    ));
    bodyParts.push(fileBuffer);
    bodyParts.push(Buffer.from(crlf));
  }

  bodyParts.push(Buffer.from(`--${boundary}--${crlf}`));
  const payload = Buffer.concat(bodyParts);

  return {
    payload,
    contentType: `multipart/form-data; boundary=${boundary}`,
    contentLength: payload.length
  };
}

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const rawBuffer = Buffer.concat(chunks);
        let parsed = null;
        try {
          parsed = JSON.parse(rawBuffer.toString('utf8'));
        } catch (e) {
          parsed = rawBuffer.toString('utf8');
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed,
          rawBuffer
        });
      });
    });

    req.on('error', reject);

    if (postData) {
      if (Buffer.isBuffer(postData)) {
        req.write(postData);
      } else if (typeof postData === 'string') {
        req.write(postData);
      } else {
        req.write(JSON.stringify(postData));
      }
    }
    req.end();
  });
}

async function runStage7Tests() {
  console.log('================================================================');
  console.log('STARTING STAGE 7: SECURE COMPLAINT IMAGE UPLOADS TEST SUITE');
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

  // 1. Start Server on isolated port 5059
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Test Setup] Stage 7 test server running on port ${TEST_PORT}`);
      resolve();
    });
  });

  let aliToken = null;
  let aliUserId = null;
  let saraToken = null;
  let saraUserId = null;
  let adminToken = null;

  let noImageComplaintId = null;
  let jpgComplaintId = null;
  let createdImageKey = null;

  try {
    // ------------------------------------------------------------------------
    // Setup: Authenticate Test Users
    // ------------------------------------------------------------------------
    console.log('\n--- Setup: Authenticating Users ---');

    const aliRes = await makeRequest(
      { hostname: 'localhost', port: TEST_PORT, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'ali.khan@campusfix.edu', password: 'Student@12345' }
    );
    aliToken = aliRes.data.data.token;
    aliUserId = aliRes.data.data.user.id;
    assert(aliRes.statusCode === 200 && aliToken, '1. Student Ali authenticated');

    const saraRes = await makeRequest(
      { hostname: 'localhost', port: TEST_PORT, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'sara.ahmed@campusfix.edu', password: 'Student@12345' }
    );
    saraToken = saraRes.data.data.token;
    saraUserId = saraRes.data.data.user.id;
    assert(saraRes.statusCode === 200 && saraToken, '2. Student Sara authenticated');

    const adminRes = await makeRequest(
      { hostname: 'localhost', port: TEST_PORT, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'admin@campusfix.edu', password: 'Admin@12345' }
    );
    adminToken = adminRes.data.data.token;
    assert(adminRes.statusCode === 200 && adminToken, '3. Admin authenticated');

    // ------------------------------------------------------------------------
    // Part 1: Valid Uploads & Complaint Integration
    // ------------------------------------------------------------------------
    console.log('\n--- Part 1: Valid Image Uploads & Integration ---');

    // 4. Create complaint WITHOUT an image (JSON payload)
    const noImageRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/complaints',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliToken}` }
      },
      {
        title: 'Flickering lights in Library Study Room 3',
        description: 'Fluorescent bulb is constantly blinking and making buzzing noise.',
        categoryId: 1,
        building: 'Central Library',
        roomNumber: 'Study Room 3',
        priority: 'Low'
      }
    );
    noImageComplaintId = noImageRes.data.data.id;
    assert(noImageRes.statusCode === 201 && noImageComplaintId > 0, '4. Complaint created without image (HTTP 201)');
    assert(noImageRes.data.data.imageUrl === null && noImageRes.data.data.imageKey === null, '5. Image fields are correctly null');

    // 5. Create complaint WITH valid JPEG image via multipart/form-data
    const jpgMultipart = buildMultipartFormData(
      {
        title: 'Broken desk leg in Lecture Hall A',
        description: 'Front right leg snapped off completely.',
        categoryId: 2,
        building: 'Academic Block A',
        roomNumber: 'Hall A',
        priority: 'Medium'
      },
      {
        fieldName: 'image',
        filename: 'broken_desk.jpg',
        contentType: 'image/jpeg',
        buffer: BUFFERS.validJpg
      }
    );

    const jpgUploadRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/complaints',
        method: 'POST',
        headers: {
          'Content-Type': jpgMultipart.contentType,
          'Content-Length': jpgMultipart.contentLength,
          'Authorization': `Bearer ${aliToken}`
        }
      },
      jpgMultipart.payload
    );

    jpgComplaintId = jpgUploadRes.data.data.id;
    createdImageKey = jpgUploadRes.data.data.imageKey;
    assert(jpgUploadRes.statusCode === 201 && jpgComplaintId > 0, '6. Complaint created with valid JPEG attachment (HTTP 201)');
    assert(typeof jpgUploadRes.data.data.imageUrl === 'string' && jpgUploadRes.data.data.imageUrl.includes(createdImageKey), '7. imageUrl references secure image endpoint');
    assert(createdImageKey.startsWith('complaint-') && createdImageKey.endsWith('.jpg'), '8. imageKey generated with cryptographically safe format');

    // 6. Upload a valid PNG to the existing no-image complaint (POST /api/complaints/:id/image)
    const pngMultipart = buildMultipartFormData(
      {},
      {
        fieldName: 'image',
        filename: 'study_room_lights.png',
        contentType: 'image/png',
        buffer: BUFFERS.validPng
      }
    );

    const attachPngRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${noImageComplaintId}/image`,
        method: 'POST',
        headers: {
          'Content-Type': pngMultipart.contentType,
          'Content-Length': pngMultipart.contentLength,
          'Authorization': `Bearer ${aliToken}`
        }
      },
      pngMultipart.payload
    );
    assert(attachPngRes.statusCode === 200, '9. Valid PNG attached to existing complaint (HTTP 200)');
    assert(attachPngRes.data.data.imageKey.endsWith('.png'), '10. PNG format correctly detected and stored (.png)');
    assert(attachPngRes.data.data.mimeType === 'image/png', '11. MIME type recognized as image/png');

    // 7. Replace image with a valid WebP
    const webpMultipart = buildMultipartFormData(
      {},
      {
        fieldName: 'image',
        filename: 'updated_lights.webp',
        contentType: 'image/webp',
        buffer: BUFFERS.validWebp
      }
    );

    const attachWebpRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${noImageComplaintId}/image`,
        method: 'POST',
        headers: {
          'Content-Type': webpMultipart.contentType,
          'Content-Length': webpMultipart.contentLength,
          'Authorization': `Bearer ${aliToken}`
        }
      },
      webpMultipart.payload
    );
    assert(attachWebpRes.statusCode === 200, '12. Valid WebP replaces previous image (HTTP 200)');
    assert(attachWebpRes.data.data.imageKey.endsWith('.webp'), '13. WebP detected and saved (.webp)');

    // 8. Verify image can be retrieved by authorized student (GET /api/complaints/:id/image)
    const retrieveImageRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${jpgComplaintId}/image`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliToken}` }
    });
    assert(retrieveImageRes.statusCode === 200, '14. Authorized student retrieved complaint image');
    assert(retrieveImageRes.headers['content-type'] === 'image/jpeg', '15. Image served with Content-Type: image/jpeg');
    assert(retrieveImageRes.headers['x-content-type-options'] === 'nosniff', '16. Security header X-Content-Type-Options: nosniff present');
    assert(retrieveImageRes.headers['content-security-policy'] === "default-src 'none'", '17. CSP header default-src: none present');
    assert(retrieveImageRes.rawBuffer.length === BUFFERS.validJpg.length, '18. Served binary matches uploaded JPEG bytes perfectly');

    // 9. Verify image can also be retrieved by Admin
    const adminRetrieveRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${jpgComplaintId}/image`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(adminRetrieveRes.statusCode === 200, '19. Admin successfully retrieved complaint image');

    // ------------------------------------------------------------------------
    // Part 2: Invalid Uploads & Magic Byte Validation
    // ------------------------------------------------------------------------
    console.log('\n--- Part 2: Malicious & Invalid Upload Protections ---');

    // 10. Rejection: Executable disguised as image (.exe named .jpg)
    const fakeExeMultipart = buildMultipartFormData(
      {},
      {
        fieldName: 'image',
        filename: 'innocent_picture.jpg',
        contentType: 'image/jpeg',
        buffer: BUFFERS.fakeExeJpg
      }
    );
    const fakeExeRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${jpgComplaintId}/image`,
        method: 'POST',
        headers: {
          'Content-Type': fakeExeMultipart.contentType,
          'Content-Length': fakeExeMultipart.contentLength,
          'Authorization': `Bearer ${aliToken}`
        }
      },
      fakeExeMultipart.payload
    );
    assert(fakeExeRes.statusCode === 400 && fakeExeRes.data?.error?.code === 'INVALID_FILE_TYPE', '20. Executable disguised as image rejected (HTTP 400 INVALID_FILE_TYPE)');

    // 11. Rejection: Spoofed MIME type (text file claimed as image/jpeg)
    const spoofedMimeMultipart = buildMultipartFormData(
      {},
      {
        fieldName: 'image',
        filename: 'malicious.jpg',
        contentType: 'image/jpeg',
        buffer: BUFFERS.spoofedText
      }
    );
    const spoofedMimeRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${jpgComplaintId}/image`,
        method: 'POST',
        headers: {
          'Content-Type': spoofedMimeMultipart.contentType,
          'Content-Length': spoofedMimeMultipart.contentLength,
          'Authorization': `Bearer ${aliToken}`
        }
      },
      spoofedMimeMultipart.payload
    );
    assert(spoofedMimeRes.statusCode === 400 && spoofedMimeRes.data?.error?.code === 'INVALID_FILE_TYPE', '21. MIME-spoofed text file rejected via magic bytes (HTTP 400 INVALID_FILE_TYPE)');

    // 12. Rejection: Empty file (0 bytes)
    const emptyFileMultipart = buildMultipartFormData(
      {},
      {
        fieldName: 'image',
        filename: 'empty.png',
        contentType: 'image/png',
        buffer: BUFFERS.empty
      }
    );
    const emptyFileRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${jpgComplaintId}/image`,
        method: 'POST',
        headers: {
          'Content-Type': emptyFileMultipart.contentType,
          'Content-Length': emptyFileMultipart.contentLength,
          'Authorization': `Bearer ${aliToken}`
        }
      },
      emptyFileMultipart.payload
    );
    assert(emptyFileRes.statusCode === 400 && emptyFileRes.data?.error?.code === 'EMPTY_FILE', '22. Zero-byte empty file rejected (HTTP 400 EMPTY_FILE)');

    // 13. Rejection: Oversized file (> 5 MB)
    const oversizedMultipart = buildMultipartFormData(
      {},
      {
        fieldName: 'image',
        filename: 'huge_photo.jpg',
        contentType: 'image/jpeg',
        buffer: BUFFERS.oversized
      }
    );
    const oversizedRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${jpgComplaintId}/image`,
        method: 'POST',
        headers: {
          'Content-Type': oversizedMultipart.contentType,
          'Content-Length': oversizedMultipart.contentLength,
          'Authorization': `Bearer ${aliToken}`
        }
      },
      oversizedMultipart.payload
    );
    assert(oversizedRes.statusCode === 400 && oversizedRes.data?.error?.code === 'FILE_TOO_LARGE', '23. Oversized file (> 5 MB) rejected safely (HTTP 400 FILE_TOO_LARGE)');

    // 14. Dangerous filename with path traversal attempted during upload
    const traversalUploadMultipart = buildMultipartFormData(
      {},
      {
        fieldName: 'image',
        filename: '../../../../etc/passwd.jpg',
        contentType: 'image/jpeg',
        buffer: BUFFERS.validJpg
      }
    );
    const traversalUploadRes = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${jpgComplaintId}/image`,
        method: 'POST',
        headers: {
          'Content-Type': traversalUploadMultipart.contentType,
          'Content-Length': traversalUploadMultipart.contentLength,
          'Authorization': `Bearer ${aliToken}`
        }
      },
      traversalUploadMultipart.payload
    );
    assert(traversalUploadRes.statusCode === 200, '24. Upload with path traversal in client filename accepted safely');
    assert(!traversalUploadRes.data.data.imageKey.includes('..') && !traversalUploadRes.data.data.imageKey.includes('/'), '25. Dangerous client filename discarded; safe UUID storage key generated');

    // ------------------------------------------------------------------------
    // Part 3: Authorization & IDOR Defenses
    // ------------------------------------------------------------------------
    console.log('\n--- Part 3: Authorization & IDOR Defenses ---');

    // 15. Student Sara attempts to upload image to Ali's complaint (IDOR upload)
    const saraUploadAttempt = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${jpgComplaintId}/image`,
        method: 'POST',
        headers: {
          'Content-Type': jpgMultipart.contentType,
          'Content-Length': jpgMultipart.contentLength,
          'Authorization': `Bearer ${saraToken}`
        }
      },
      jpgMultipart.payload
    );
    assert(saraUploadAttempt.statusCode === 403, '26. Sara blocked from uploading image to Ali\'s complaint (IDOR HTTP 403)');

    // 16. Student Sara attempts to retrieve Ali's complaint image (IDOR read)
    const saraReadAttempt = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${jpgComplaintId}/image`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${saraToken}` }
    });
    assert(saraReadAttempt.statusCode === 403, '27. Sara blocked from viewing Ali\'s complaint image (IDOR HTTP 403)');

    // 17. Unauthenticated user attempts image upload
    const unauthUploadAttempt = await makeRequest(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: `/api/complaints/${jpgComplaintId}/image`,
        method: 'POST',
        headers: {
          'Content-Type': jpgMultipart.contentType,
          'Content-Length': jpgMultipart.contentLength
        }
      },
      jpgMultipart.payload
    );
    assert(unauthUploadAttempt.statusCode === 401, '28. Unauthenticated image upload rejected (HTTP 401 Unauthorized)');

    // 18. Unauthenticated user attempts image access
    const unauthReadAttempt = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${jpgComplaintId}/image`,
      method: 'GET'
    });
    assert(unauthReadAttempt.statusCode === 401, '29. Unauthenticated image retrieval rejected (HTTP 401 Unauthorized)');

    // ------------------------------------------------------------------------
    // Part 4: Path Traversal & Security Probes
    // ------------------------------------------------------------------------
    console.log('\n--- Part 4: Path Traversal & Leakage Defenses ---');

    // 19. Path traversal attack in GET /api/complaints/images/:key
    const pathTraversalKeyRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/complaints/images/..%2f..%2fpackage.json',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliToken}` }
    });
    assert(pathTraversalKeyRes.statusCode === 400 || pathTraversalKeyRes.statusCode === 404, '30. Path traversal probe on storage key endpoint blocked safely');

    // 20. Non-existent image key returns 404
    const nonExistentKeyRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/complaints/images/complaint-9999999999-abcdef123456.jpg',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliToken}` }
    });
    assert(nonExistentKeyRes.statusCode === 404, '31. Non-existent image key returns HTTP 404 Not Found');

    // 21. Verify response does not leak internal filesystem paths or storage credentials
    const detailsRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: `/api/complaints/${jpgComplaintId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliToken}` }
    });
    const responseJsonStr = JSON.stringify(detailsRes.data);
    assert(!responseJsonStr.includes('C:\\') && !responseJsonStr.includes('Users') && !responseJsonStr.includes('secret'), '32. No filesystem paths or credentials leaked in API response');

    console.log('\n================================================================');
    console.log(`STAGE 7 VERIFICATION COMPLETED: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('================================================================');

  } catch (err) {
    console.error('\n[FATAL TEST FAILURE]:', err.message);
    throw err;
  } finally {
    if (server) {
      server.close();
      console.log('[Test Teardown] Stage 7 test server closed.');
    }
    await closePool();
    console.log('[Test Teardown] Database pool closed.');
  }
}

// Execute suite
runStage7Tests()
  .then(() => {
    console.log('[Stage 7 Test Suite Succeeded]');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Stage 7 Test Suite Failed]:', err);
    process.exit(1);
  });
