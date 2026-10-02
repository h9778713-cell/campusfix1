-- ============================================================================
-- Migration: 001_initial_schema.sql
-- Database: CampusFixDB
-- Engine: Microsoft SQL Server
-- Description: Creates foundational tables, constraints, foreign keys, and indexes.
-- ============================================================================

USE CampusFixDB;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Users Table
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        id INT IDENTITY(1,1) NOT NULL,
        fullName NVARCHAR(150) NOT NULL,
        email NVARCHAR(255) NOT NULL,
        passwordHash NVARCHAR(255) NOT NULL,
        role NVARCHAR(20) NOT NULL,
        studentId NVARCHAR(50) NULL,
        phone NVARCHAR(25) NULL,
        isActive BIT NOT NULL CONSTRAINT DF_Users_isActive DEFAULT 1,
        createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Users_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Users_updatedAt DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_Users PRIMARY KEY CLUSTERED (id ASC),
        CONSTRAINT UQ_Users_email UNIQUE NONCLUSTERED (email ASC),
        CONSTRAINT CK_Users_role CHECK (role IN (N'student', N'admin'))
    );
    PRINT 'Table Users created.';
END
ELSE
BEGIN
    PRINT 'Table Users already exists.';
END
GO

-- Filtered unique index on studentId (allows multiple NULLs for admin/staff accounts)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'UQ_Users_studentId' AND object_id = OBJECT_ID(N'dbo.Users'))
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UQ_Users_studentId 
    ON dbo.Users (studentId ASC) 
    WHERE studentId IS NOT NULL;
    PRINT 'Filtered unique index UQ_Users_studentId created.';
END
GO

-- 2. Departments Table
IF OBJECT_ID(N'dbo.Departments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Departments (
        id INT IDENTITY(1,1) NOT NULL,
        name NVARCHAR(100) NOT NULL,
        contactEmail NVARCHAR(255) NULL,
        officeLocation NVARCHAR(150) NULL,
        isActive BIT NOT NULL CONSTRAINT DF_Departments_isActive DEFAULT 1,
        createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Departments_createdAt DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_Departments PRIMARY KEY CLUSTERED (id ASC),
        CONSTRAINT UQ_Departments_name UNIQUE NONCLUSTERED (name ASC)
    );
    PRINT 'Table Departments created.';
END
ELSE
BEGIN
    PRINT 'Table Departments already exists.';
END
GO

-- 3. Categories Table
IF OBJECT_ID(N'dbo.Categories', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Categories (
        id INT IDENTITY(1,1) NOT NULL,
        name NVARCHAR(100) NOT NULL,
        description NVARCHAR(300) NULL,
        departmentId INT NOT NULL,
        isActive BIT NOT NULL CONSTRAINT DF_Categories_isActive DEFAULT 1,
        createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Categories_createdAt DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_Categories PRIMARY KEY CLUSTERED (id ASC),
        CONSTRAINT UQ_Categories_name UNIQUE NONCLUSTERED (name ASC),
        CONSTRAINT FK_Categories_Departments FOREIGN KEY (departmentId) 
            REFERENCES dbo.Departments (id) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
    PRINT 'Table Categories created.';
END
ELSE
BEGIN
    PRINT 'Table Categories already exists.';
END
GO

-- 4. Complaints Table
IF OBJECT_ID(N'dbo.Complaints', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Complaints (
        id INT IDENTITY(1,1) NOT NULL,
        complaintCode NVARCHAR(30) NOT NULL,
        title NVARCHAR(200) NOT NULL,
        description NVARCHAR(MAX) NOT NULL,
        categoryId INT NOT NULL,
        studentId INT NOT NULL,
        building NVARCHAR(120) NOT NULL,
        roomNumber NVARCHAR(50) NULL,
        priority NVARCHAR(20) NOT NULL,
        status NVARCHAR(20) NOT NULL,
        imageUrl NVARCHAR(500) NULL,
        imageKey NVARCHAR(255) NULL,
        resolvedAt DATETIME2(3) NULL,
        closedAt DATETIME2(3) NULL,
        createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_Complaints_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Complaints_updatedAt DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_Complaints PRIMARY KEY CLUSTERED (id ASC),
        CONSTRAINT UQ_Complaints_complaintCode UNIQUE NONCLUSTERED (complaintCode ASC),
        CONSTRAINT CK_Complaints_priority CHECK (priority IN (N'Low', N'Medium', N'High', N'Critical')),
        CONSTRAINT CK_Complaints_status CHECK (status IN (N'Pending', N'In Progress', N'Resolved', N'Closed', N'Rejected')),
        CONSTRAINT FK_Complaints_Categories FOREIGN KEY (categoryId) 
            REFERENCES dbo.Categories (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_Complaints_Users_Student FOREIGN KEY (studentId) 
            REFERENCES dbo.Users (id) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
    PRINT 'Table Complaints created.';
END
ELSE
BEGIN
    PRINT 'Table Complaints already exists.';
END
GO

-- 5. ComplaintComments Table
IF OBJECT_ID(N'dbo.ComplaintComments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ComplaintComments (
        id INT IDENTITY(1,1) NOT NULL,
        complaintId INT NOT NULL,
        userId INT NOT NULL,
        commentText NVARCHAR(MAX) NOT NULL,
        isAdminOnly BIT NOT NULL CONSTRAINT DF_ComplaintComments_isAdminOnly DEFAULT 0,
        createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_ComplaintComments_createdAt DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_ComplaintComments PRIMARY KEY CLUSTERED (id ASC),
        CONSTRAINT FK_ComplaintComments_Complaints FOREIGN KEY (complaintId) 
            REFERENCES dbo.Complaints (id) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT FK_ComplaintComments_Users FOREIGN KEY (userId) 
            REFERENCES dbo.Users (id) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
    PRINT 'Table ComplaintComments created.';
END
ELSE
BEGIN
    PRINT 'Table ComplaintComments already exists.';
END
GO

-- 6. ComplaintStatusHistory Table
IF OBJECT_ID(N'dbo.ComplaintStatusHistory', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ComplaintStatusHistory (
        id INT IDENTITY(1,1) NOT NULL,
        complaintId INT NOT NULL,
        oldStatus NVARCHAR(20) NULL,
        newStatus NVARCHAR(20) NOT NULL,
        changedByUserId INT NOT NULL,
        remarks NVARCHAR(500) NULL,
        changedAt DATETIME2(3) NOT NULL CONSTRAINT DF_ComplaintStatusHistory_changedAt DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_ComplaintStatusHistory PRIMARY KEY CLUSTERED (id ASC),
        CONSTRAINT CK_ComplaintStatusHistory_newStatus CHECK (newStatus IN (N'Pending', N'In Progress', N'Resolved', N'Closed', N'Rejected')),
        CONSTRAINT FK_ComplaintStatusHistory_Complaints FOREIGN KEY (complaintId) 
            REFERENCES dbo.Complaints (id) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT FK_ComplaintStatusHistory_Users FOREIGN KEY (changedByUserId) 
            REFERENCES dbo.Users (id) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
    PRINT 'Table ComplaintStatusHistory created.';
END
ELSE
BEGIN
    PRINT 'Table ComplaintStatusHistory already exists.';
END
GO

-- 7. ComplaintAssignments Table
IF OBJECT_ID(N'dbo.ComplaintAssignments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ComplaintAssignments (
        id INT IDENTITY(1,1) NOT NULL,
        complaintId INT NOT NULL,
        departmentId INT NOT NULL,
        assignedToUserId INT NULL,
        assignedByUserId INT NOT NULL,
        assignmentNotes NVARCHAR(500) NULL,
        assignedAt DATETIME2(3) NOT NULL CONSTRAINT DF_ComplaintAssignments_assignedAt DEFAULT SYSUTCDATETIME(),
        isActive BIT NOT NULL CONSTRAINT DF_ComplaintAssignments_isActive DEFAULT 1,

        CONSTRAINT PK_ComplaintAssignments PRIMARY KEY CLUSTERED (id ASC),
        CONSTRAINT FK_ComplaintAssignments_Complaints FOREIGN KEY (complaintId) 
            REFERENCES dbo.Complaints (id) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT FK_ComplaintAssignments_Departments FOREIGN KEY (departmentId) 
            REFERENCES dbo.Departments (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_ComplaintAssignments_Users_AssignedTo FOREIGN KEY (assignedToUserId) 
            REFERENCES dbo.Users (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_ComplaintAssignments_Users_AssignedBy FOREIGN KEY (assignedByUserId) 
            REFERENCES dbo.Users (id) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
    PRINT 'Table ComplaintAssignments created.';
END
ELSE
BEGIN
    PRINT 'Table ComplaintAssignments already exists.';
END
GO

-- ============================================================================
-- Indexes for Search & Filter Performance
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_Complaints_StudentId_Status' AND object_id = OBJECT_ID(N'dbo.Complaints'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Complaints_StudentId_Status 
    ON dbo.Complaints (studentId ASC, status ASC)
    INCLUDE (title, priority, createdAt, categoryId);
    PRINT 'Index IX_Complaints_StudentId_Status created.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_Complaints_Status_Priority' AND object_id = OBJECT_ID(N'dbo.Complaints'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Complaints_Status_Priority 
    ON dbo.Complaints (status ASC, priority ASC)
    INCLUDE (categoryId, building, createdAt);
    PRINT 'Index IX_Complaints_Status_Priority created.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_Complaints_CategoryId' AND object_id = OBJECT_ID(N'dbo.Complaints'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Complaints_CategoryId 
    ON dbo.Complaints (categoryId ASC);
    PRINT 'Index IX_Complaints_CategoryId created.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_Complaints_CreatedAt' AND object_id = OBJECT_ID(N'dbo.Complaints'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Complaints_CreatedAt 
    ON dbo.Complaints (createdAt DESC);
    PRINT 'Index IX_Complaints_CreatedAt created.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_ComplaintComments_ComplaintId' AND object_id = OBJECT_ID(N'dbo.ComplaintComments'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_ComplaintComments_ComplaintId 
    ON dbo.ComplaintComments (complaintId ASC, createdAt ASC);
    PRINT 'Index IX_ComplaintComments_ComplaintId created.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_ComplaintStatusHistory_ComplaintId' AND object_id = OBJECT_ID(N'dbo.ComplaintStatusHistory'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_ComplaintStatusHistory_ComplaintId 
    ON dbo.ComplaintStatusHistory (complaintId ASC, changedAt ASC);
    PRINT 'Index IX_ComplaintStatusHistory_ComplaintId created.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_ComplaintAssignments_ComplaintId_Active' AND object_id = OBJECT_ID(N'dbo.ComplaintAssignments'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_ComplaintAssignments_ComplaintId_Active 
    ON dbo.ComplaintAssignments (complaintId ASC, isActive ASC);
    PRINT 'Index IX_ComplaintAssignments_ComplaintId_Active created.';
END
GO

PRINT '001_initial_schema migration verified.';
GO
