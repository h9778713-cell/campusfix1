# CampusFix — Environment Setup & Local Run Guide

## 1. Prerequisites

Before running the CampusFix application, ensure the following software is present on your system:

- **Node.js**: v18.0.0 or later (LTS recommended)
- **Microsoft SQL Server**: 2017, 2019, 2022, or SQL Server Express (Service: `MSSQLSERVER`)
- **SQL Server Management Studio (SSMS)** or `sqlcmd` utility
- Modern Web Browser: Chrome, Firefox, Edge, or Safari

---

## 2. Step-by-Step Installation

### Step 1: Configure Environment Variables

Navigate to the project root directory and copy `.env.example` to `.env`:

```bash
cd campusfix
copy .env.example .env
```

Adjust the database connection variables in `.env` to match your local SQL Server instance:

```env
PORT=5000
NODE_ENV=development

# Database Settings
DB_SERVER=localhost
DB_PORT=1433
DB_NAME=CampusFixDB
DB_USER=sa
DB_PASSWORD=YourPasswordHere
DB_TRUST_SERVER_CERTIFICATE=true
DB_ENCRYPT=false

# Security
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long!
```

> **Note on SQL Server Authentication**:
> Make sure **Mixed Mode Authentication (SQL Server and Windows Authentication)** is enabled in your SQL Server instance, and that TCP/IP protocol is enabled in SQL Server Configuration Manager (Port 1433).

---

### Step 2: Create Database & Execute Migrations

1. Run the database setup script using `sqlcmd` or execute in SSMS:

```bash
sqlcmd -S localhost -E -i database/scripts/setup_db.sql
sqlcmd -S localhost -d CampusFixDB -E -i database/migrations/001_initial_schema.sql
sqlcmd -S localhost -d CampusFixDB -E -i database/seeds/001_seed_initial_data.sql
```

*(Alternatively, the backend can auto-verify tables on initial launch in development mode).*

---

### Step 3: Install Backend Dependencies

Navigate to the `backend` folder and run:

```bash
cd backend
npm install
```

---

### Step 4: Start the Application

To start the server with auto-reload:

```bash
npm run dev
```

Or standard start:

```bash
npm start
```

The server will initialize:
```text
[CampusFix] Server running in development mode on http://localhost:5000
[CampusFix] Connected to Microsoft SQL Server: CampusFixDB on localhost:1433
[CampusFix] Serving frontend static assets from public directory
```

---

### Step 5: Access the Web Application

Open your browser and navigate to:
**`http://localhost:5000`**

---

## 3. Seeded Demo Accounts

The seed script initializes the following demo accounts for testing:

### Admin Account
- **Email**: `admin@campusfix.edu`
- **Password**: `Admin@12345`
- **Role**: `admin`
- **Access**: Full administration dashboard, status changes, assignments, analytics.

### Student Account
- **Email**: `student@campusfix.edu`
- **Password**: `Student@12345`
- **Role**: `student`
- **Student ID**: `BCS-2022-001`
- **Access**: Submit complaints, track status history, view own complaints.

---

## 4. Troubleshooting Checklist

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `ELOGIN` or `Login failed for user` | Invalid SQL credentials or SQL auth disabled | Enable Mixed Authentication in SQL Server Properties and restart `MSSQLSERVER` service. |
| `ESOCKET` / Connection timeout | TCP/IP disabled in SQL Server Configuration Manager | Open SQL Server Configuration Manager -> SQL Server Network Configuration -> Protocols -> Enable TCP/IP on Port 1433. |
| Port 5000 already in use | Another process running on port 5000 | Change `PORT=5050` in `.env`. |
