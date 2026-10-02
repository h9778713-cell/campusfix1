# CampusFix — Security Architecture & Threat Mitigation Guide

Security in CampusFix is built as a **first-class requirement** embedded across all tiers of the application. The system strictly addresses vulnerabilities in the **OWASP Top 10**.

---

## 1. Authentication & Session Security

1. **Password Hashing**:
   - Passwords are encrypted using `bcryptjs` with **12 salt rounds**.
   - Plaintext passwords are never logged, stored in memory longer than the verification cycle, or saved in the database.
2. **Token Management**:
   - Stateless **JSON Web Tokens (JWT)** are signed with high-entropy cryptographic keys (`JWT_SECRET`, min 32 characters).
   - Tokens have an explicit expiration time (`JWT_EXPIRES_IN=7d`).
   - Sensitive user information (e.g. password hashes) is strictly omitted from the token payload.
3. **Role & Privilege Integrity**:
   - User roles (`student`, `admin`) are strictly server-controlled.
   - The public registration endpoint (`/api/auth/register`) hardcodes the assigned role to `student`. Admin accounts cannot be self-registered and require database seeding or superadmin creation.

---

## 2. Authorization & IDOR (Insecure Direct Object Reference) Protection

1. **Server-Side Enforcement**:
   - Client-provided roles, user IDs, or admin claims are completely disregarded.
   - Authentication middleware decodes the JWT and populates `req.user`.
2. **Object-Level Access Verification**:
   - When a student fetches complaint details (`GET /api/complaints/:id`) or adds a comment (`POST /api/complaints/:id/comments`), the backend validates ownership:
     ```javascript
     if (user.role !== 'admin' && complaint.studentId !== user.id) {
       return res.status(403).json({
         success: false,
         error: { code: 'FORBIDDEN', message: 'You do not have permission to view this complaint.' }
       });
     }
     ```
3. **Role-Based Endpoint Protection**:
   - Admin-only routes (`/api/admin/*`) require explicit verification:
     ```javascript
     const requireAdmin = (req, res, next) => {
       if (req.user?.role !== 'admin') {
         return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required.' } });
       }
       next();
     };
     ```

---

## 3. SQL Injection Defense

1. **Strict Parameterization**:
   - Every SQL statement executed through the `mssql` package utilizes explicit input bindings:
     ```javascript
     const request = pool.request();
     request.input('id', sql.Int, complaintId);
     request.input('status', sql.NVarChar(20), status);
     const result = await request.query(
       'SELECT * FROM Complaints WHERE id = @id AND status = @status'
     );
     ```
   - String concatenation, template string interpolation (`${variable}`) inside SQL statements, or dynamic unchecked query builders are strictly prohibited.

---

## 4. Cross-Site Scripting (XSS) & Input Validation

1. **Defense on Input**:
   - All client inputs (complaint titles, descriptions, comments, user names) are validated using server-side validators (length, format, character sets).
2. **Defense on Rendering**:
   - Vanilla JavaScript frontend strictly uses safe DOM manipulation methods (`element.textContent`, `element.setAttribute`) when rendering user-submitted text.
   - `innerHTML` with unsanitized dynamic user content is banned.
3. **Security Headers via Helmet**:
   - `Content-Security-Policy`: Restricts scripts, styles, and font origins.
   - `X-Frame-Options: DENY`: Defends against clickjacking.
   - `X-Content-Type-Options: nosniff`: Prevents MIME-type confusion attacks.
   - `Referrer-Policy: strict-origin-when-cross-origin`.

---

## 5. File Upload & Media Storage Security

1. **Storage Isolation**:
   - **Binaries are never stored in Microsoft SQL Server**.
   - Images are processed by a dedicated storage provider (local upload vault during development, S3/Azure Blob in cloud production).
2. **Validation Safeguards**:
   - **File Size Limit**: Capped at 5 MB via `multer`.
   - **MIME Whitelisting**: Restricted exclusively to `image/jpeg`, `image/png`, `image/webp`.
   - **Filename Sanitization**: The original user-supplied filename is never used on disk. Uploaded files are renamed using cryptographic UUIDs (`crypto.randomUUID() + extension`).
   - **Path Traversal Defense**: Files are saved into a strictly isolated root uploads folder without allowing `../` traversal.

---

## 6. Rate Limiting & Denial of Service (DoS)

1. **Authentication Limiter**:
   - Endpoint: `/api/auth/login` and `/api/auth/register`
   - Limit: Maximum 10 requests per 15 minutes per IP.
2. **General API Limiter**:
   - Endpoint: `/api/*`
   - Limit: Maximum 100 requests per 15 minutes per IP.
3. **Payload Size Limits**:
   - JSON body parser limited to 1 MB (`express.json({ limit: '1mb' })`).

---

## 7. Error Handling & Information Disclosure

1. **Safe Production Error Messages**:
   - Internal database errors, SQL syntax exceptions, or server stack traces are logged on the server but never sent in HTTP responses.
   - Responses always return clean, user-friendly error codes:
     ```json
     {
       "success": false,
       "error": {
         "code": "INTERNAL_SERVER_ERROR",
         "message": "An unexpected error occurred. Please contact system support."
       }
     }
     ```
2. **Secrets & Credentials Management**:
   - Database credentials, JWT signing keys, and cloud storage tokens are loaded exclusively from `.env`.
   - `.env` is ignored in `.gitignore` and never committed to source control.
