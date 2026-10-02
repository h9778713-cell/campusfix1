# CampusFix — RESTful API Specification

## 1. Global Conventions

- **Base URL**: `/api`
- **Default Content-Type**: `application/json` (or `multipart/form-data` for file uploads)
- **Authentication**: Bearer Token in `Authorization` header (`Bearer <JWT>`) or Secure HTTP-only Cookie.
- **Timestamp Format**: ISO 8601 UTC (e.g. `2026-10-02T10:45:00.000Z`)

### Standard Response Envelope

Success:
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

Error:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password provided"
  }
}
```

---

## 2. Authentication API (`/api/auth`)

### 2.1 Register Student
- **Method**: `POST`
- **Path**: `/api/auth/register`
- **Access**: Public
- **Request Body**:
```json
{
  "fullName": "Jane Doe",
  "email": "jane.doe@university.edu",
  "password": "SecurePassword123!",
  "studentId": "FA22-BCS-042",
  "phone": "+1-555-0199"
}
```
- **Responses**:
  - `201 Created`: User created and authenticated token returned.
  - `400 Bad Request`: Validation failure (weak password, missing fields).
  - `409 Conflict`: Email or Student ID already registered.

### 2.2 Login User
- **Method**: `POST`
- **Path**: `/api/auth/login`
- **Access**: Public
- **Request Body**:
```json
{
  "email": "jane.doe@university.edu",
  "password": "SecurePassword123!"
}
```
- **Responses**:
  - `200 OK`: Returns JWT token and sanitized user profile (id, fullName, email, role).
  - `401 Unauthorized`: Invalid credentials.
  - `429 Too Many Requests`: Exceeded rate limit (10 failed attempts).

### 2.3 Get Current Profile
- **Method**: `GET`
- **Path**: `/api/auth/me`
- **Access**: Authenticated (`student`, `admin`)
- **Responses**:
  - `200 OK`: Returns current user details.
  - `401 Unauthorized`: Missing or invalid JWT.

---

## 3. Metadata API (`/api/metadata`)

### 3.1 List Active Categories
- **Method**: `GET`
- **Path**: `/api/categories`
- **Access**: Authenticated

### 3.2 List Active Departments
- **Method**: `GET`
- **Path**: `/api/departments`
- **Access**: Authenticated

---

## 4. Complaints API (`/api/complaints`)

### 4.1 Submit New Complaint
- **Method**: `POST`
- **Path**: `/api/complaints`
- **Access**: Authenticated (`student`, `admin`)
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `title` (string, 5-200 chars, required)
  - `description` (string, 10-2000 chars, required)
  - `categoryId` (int, required)
  - `building` (string, required)
  - `roomNumber` (string, optional)
  - `priority` (string: `'Low' | 'Medium' | 'High' | 'Critical'`, required)
  - `image` (file, optional, max 5MB, jpeg/png/webp)
- **Responses**:
  - `201 Created`: Complaint created with generated `complaintCode`.
  - `400 Bad Request`: Validation error or invalid file type.

### 4.2 List Student Complaints
- **Method**: `GET`
- **Path**: `/api/complaints/my`
- **Access**: Authenticated (`student`)
- **Query Parameters**:
  - `status` (optional: `Pending, In Progress, Resolved, Closed, Rejected`)
  - `priority` (optional: `Low, Medium, High, Critical`)
  - `search` (optional: substring search across title, code, building)
  - `page` (optional: default `1`)
  - `limit` (optional: default `10`, max `50`)
- **Responses**:
  - `200 OK`: Paginated list of student's own complaints.

### 4.3 Get Complaint Details
- **Method**: `GET`
- **Path**: `/api/complaints/:id`
- **Access**: Authenticated (Owner student OR `admin`)
- **Responses**:
  - `200 OK`: Complete details including category, location, image, assignment, comments, status timeline.
  - `403 Forbidden`: Student attempting to access another student's complaint (IDOR protection).
  - `404 Not Found`: Complaint ID does not exist.

---

## 5. Comments & History API

### 5.1 Post Comment
- **Method**: `POST`
- **Path**: `/api/complaints/:id/comments`
- **Access**: Authenticated (Owner student OR `admin`)
- **Request Body**:
```json
{
  "commentText": "The projector bulb was replaced this morning. Testing in progress.",
  "isAdminOnly": false
}
```

### 5.2 Get Status Timeline
- **Method**: `GET`
- **Path**: `/api/complaints/:id/history`
- **Access**: Authenticated (Owner student OR `admin`)

---

## 6. Admin API (`/api/admin`)

### 6.1 List All Campus Complaints
- **Method**: `GET`
- **Path**: `/api/admin/complaints`
- **Access**: Admin only (`role: 'admin'`)
- **Query Parameters**:
  - `search`, `status`, `priority`, `categoryId`, `building`, `page`, `limit`, `sortBy`, `sortOrder`

### 6.2 Update Complaint Status
- **Method**: `PATCH`
- **Path**: `/api/admin/complaints/:id/status`
- **Access**: Admin only
- **Request Body**:
```json
{
  "status": "In Progress",
  "remarks": "Technician dispatched to Academic Block 3, Room 204."
}
```

### 6.3 Update Priority
- **Method**: `PATCH`
- **Path**: `/api/admin/complaints/:id/priority`
- **Access**: Admin only
- **Request Body**:
```json
{
  "priority": "Critical",
  "remarks": "Escalated due to midterm exam scheduled tomorrow."
}
```

### 6.4 Assign Complaint
- **Method**: `POST`
- **Path**: `/api/admin/complaints/:id/assign`
- **Access**: Admin only
- **Request Body**:
```json
{
  "departmentId": 2,
  "assignedToUserId": null,
  "notes": "Urgent inspection requested."
}
```

### 6.5 Analytics Overview
- **Method**: `GET`
- **Path**: `/api/admin/analytics/overview`
- **Access**: Admin only
- **Responses**:
  - `200 OK`:
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalComplaints": 128,
      "pending": 24,
      "inProgress": 38,
      "resolved": 56,
      "closed": 8,
      "rejected": 2
    },
    "byCategory": [
      { "name": "Projectors & AV", "count": 42 },
      { "name": "Wi-Fi & Network", "count": 35 }
    ],
    "byPriority": [
      { "priority": "Critical", "count": 12 },
      { "priority": "High", "count": 30 },
      { "priority": "Medium", "count": 58 },
      { "priority": "Low", "count": 28 }
    ],
    "recentActivity": [ ... ]
  }
}
```
