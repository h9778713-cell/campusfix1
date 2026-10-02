# 🏛️ CampusFix — University Campus Issue Reporting & Resolution System

> A production-style, multi-tenant university campus issue management system built with Vanilla JS, Node.js, Express, and Microsoft SQL Server.

---

## 📌 Project Overview

CampusFix empowers university students to quickly submit and monitor facility issues across academic and residential campus buildings—such as broken classroom projectors, faulty electrical fittings, plumbing leaks, Wi-Fi connectivity drops, and security concerns. Campus administration and maintenance teams can triage, prioritize, assign, and resolve grievances with real-time updates and historical audit logs.

### Key Capabilities

- **Role-Based Workflows**: Tailored portals for **Students** and **Administrators**.
- **Issue Submission**: Multi-field reports including category, building, room number, urgency priority, detailed description, and evidence image upload.
- **Real-Time Audit Trail**: Complete timeline of every status transition (`Pending` -> `In Progress` -> `Resolved` -> `Closed` / `Rejected`).
- **Interactive Discussion Thread**: Two-way communication between students and facility admins on specific complaints.
- **Admin Command Center**: Multi-criteria search, filtering, department assignments, and resolution performance analytics.
- **Enterprise Security**: Strict defense against OWASP vulnerabilities, parameterized MSSQL queries, RBAC verification, rate limiting, and secure file handling.

---

## 🏗️ Architecture & Technology Stack

- **Frontend**: Responsive HTML5, CSS3, Modern Modular JavaScript (ES6+ Fetch API, DOM manipulation).
- **Backend API**: Node.js & Express.js REST API with modular MVC architecture.
- **Relational Database**: Microsoft SQL Server (MSSQL) using the `mssql` connection pool and parameterized transactions.
- **Authentication**: `bcryptjs` password hashing (12 rounds) and cryptographically signed JSON Web Tokens (JWT).
- **Media Storage**: Abstracted storage provider interface supporting local uploads and cloud object stores (S3/Azure Blob). **Images are never stored as binary BLOBs inside SQL Server.**

```text
campusfix/
├── backend/                 # Express REST API, Controllers, Middleware, Models
│   ├── config/              # DB connection & security configuration
│   ├── controllers/         # Feature logic (Auth, Complaints, Comments, Admin)
│   ├── middleware/          # JWT auth, RBAC, input validation, upload, rate limit
│   ├── models/              # Data access layer & parameterized SQL queries
│   ├── routes/              # Express API route modules
│   ├── services/            # Storage provider (cloud/local), audit logging
│   ├── utils/               # Sanitizers, response helpers, password hasher
│   ├── package.json         # Dependencies & scripts
│   └── server.js            # Server entrypoint
│
├── database/                # Relational Database Artifacts
│   ├── migrations/          # Versioned SQL Server DDL scripts
│   ├── seeds/               # Initial categories, departments, demo accounts
│   └── scripts/             # Database initialization and maintenance
│
├── frontend/                # Client-side Application
│   └── public/
│       ├── css/             # Modern CSS styles (main, dashboard, responsive grid)
│       ├── js/              # Client-side modules (api, auth, student, admin, utils)
│       ├── assets/          # Static branding, icons, images
│       ├── index.html       # Landing portal
│       ├── login.html       # Sign-in page
│       ├── register.html    # Student registration
│       ├── student-dashboard.html
│       ├── submit-complaint.html
│       ├── my-complaints.html
│       ├── complaint-details.html
│       ├── admin-dashboard.html
│       ├── admin-complaints.html
│       └── admin-analytics.html
│
└── docs/                    # Technical & Architectural Documentation
    ├── ARCHITECTURE.md      # Detailed system architecture & component diagrams
    ├── DATABASE_SCHEMA.md   # Relational ER schema, data dictionary, indexes
    ├── API_SPECIFICATION.md # REST endpoints, request/response models
    ├── SECURITY.md          # Threat mitigation, RBAC, file upload hardening
    └── SETUP_GUIDE.md       # Step-by-step developer setup & troubleshooting
```

---

## 📋 Development Roadmap

- [x] **Stage 1: Architecture & Project Setup**
  - Directory structure, architecture specs, schema designs, API contracts, security blueprint.
- [x] **Stage 2: SQL Server Database & Seed Data**
  - DDL migrations, tables, constraints, indexes, initial departments, categories, and seed accounts.
- [x] **Stage 3: Backend Setup & Database Connection**
  - Express server initialization, MSSQL connection pool with retry resilience, healthcheck endpoints.
- [x] **Stage 4: Authentication & Authorization**
  - Register, Login, JWT verification, role-based access control middleware, rate limiting.
- [x] **Stage 5: Complaint APIs**
  - CRUD operations, student complaint filtering, IDOR protection, parameterized queries.
- [x] **Stage 6: Comments, Status History & Assignments**
  - Threaded comments, immutable status change audit log, departmental assignments.
- [x] **Stage 7: Image Upload**
  - Multi-part file upload with Multer, MIME sniffing, size limit, cloud/local storage provider.
- [x] **Stage 8: Frontend UI**
  - Professional, modern university theme (Vanilla JS + CSS), accessible responsive pages.
- [x] **Stage 9: Connect Frontend to Backend**
  - Client API integration, session management, dynamic state rendering.
- [x] **Stage 10: Admin Dashboard & Analytics**
  - Interactive charts, status breakdown, search, batch filtering, export options.
- [x] **Stage 11: Validation, Error Handling & UX Polish**
  - Client & server field validation, toast notifications, loading indicators.
- [x] **Stage 12: Security Audit**
  - Vulnerability checklist verification (OWASP Top 10, SQLi, XSS, CSRF, IDOR).
- [x] **Stage 13: Automated & Manual Testing**
  - 11 complete test suites, 515/515 passing automated tests (100% pass rate).
- [ ] **Stage 14: Production Deployment Preparation**
  - Cloud deployment, containerization, environment hardening.

---

## 🚀 Getting Started

Follow the detailed instructions in [docs/SETUP_GUIDE.md](file:///C:/Users/R%20c/.gemini/antigravity/scratch/campusfix/docs/SETUP_GUIDE.md) to set up your local environment, configure Microsoft SQL Server, and launch the application.
