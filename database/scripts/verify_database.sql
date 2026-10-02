-- ============================================================================
-- Verification & Diagnostic Suite: verify_database.sql
-- Database: CampusFixDB
-- Tests table structures, seed counts, relationships, and constraints.
-- ============================================================================

USE CampusFixDB;
GO

SET NOCOUNT ON;

PRINT '=======================================================';
PRINT 'RUNNING CAMPUSFIX DATABASE VERIFICATION SUITE';
PRINT '=======================================================';

-- 1. Verify Table Record Counts
PRINT '1. Table Record Counts:';
SELECT 'Departments' AS TableName, COUNT(*) AS [RowCount] FROM dbo.Departments
UNION ALL
SELECT 'Categories', COUNT(*) FROM dbo.Categories
UNION ALL
SELECT 'Users', COUNT(*) FROM dbo.Users
UNION ALL
SELECT 'Complaints', COUNT(*) FROM dbo.Complaints
UNION ALL
SELECT 'ComplaintComments', COUNT(*) FROM dbo.ComplaintComments
UNION ALL
SELECT 'ComplaintStatusHistory', COUNT(*) FROM dbo.ComplaintStatusHistory
UNION ALL
SELECT 'ComplaintAssignments', COUNT(*) FROM dbo.ComplaintAssignments;

-- 2. Verify Relational Integrity via JOIN query
PRINT '2. Relational Integrity Test:';
SELECT 
    c.complaintCode,
    c.title,
    u.fullName AS ReportedBy,
    cat.name AS Category,
    d.name AS Department,
    c.priority,
    c.status,
    (SELECT COUNT(*) FROM dbo.ComplaintComments cc WHERE cc.complaintId = c.id) AS CommentCount,
    (SELECT COUNT(*) FROM dbo.ComplaintStatusHistory sh WHERE sh.complaintId = c.id) AS HistoryEntries
FROM dbo.Complaints c
INNER JOIN dbo.Users u ON c.studentId = u.id
INNER JOIN dbo.Categories cat ON c.categoryId = cat.id
INNER JOIN dbo.Departments d ON cat.departmentId = d.id
ORDER BY c.id ASC;

-- 3. Verify Constraints - Negative Tests
PRINT '3. Testing CHECK Constraints:';

-- Test 3.1: Invalid Role Check
BEGIN TRY
    INSERT INTO dbo.Users (fullName, email, passwordHash, role)
    VALUES (N'Fake Hacker', N'hacker@bad.com', N'hash', N'superadmin');
    PRINT 'FAIL: CK_Users_role did not block invalid role!';
END TRY
BEGIN CATCH
    PRINT 'PASS: CK_Users_role successfully blocked invalid role: ' + ERROR_MESSAGE();
END CATCH

-- Test 3.2: Invalid Complaint Status Check
BEGIN TRY
    INSERT INTO dbo.Complaints (complaintCode, title, description, categoryId, studentId, building, priority, status)
    VALUES (N'BAD-001', N'Test', N'Description', 1, 2, N'Building A', N'High', N'InvalidStatus');
    PRINT 'FAIL: CK_Complaints_status did not block invalid status!';
END TRY
BEGIN CATCH
    PRINT 'PASS: CK_Complaints_status successfully blocked invalid status: ' + ERROR_MESSAGE();
END CATCH

-- Test 3.3: Invalid Complaint Priority Check
BEGIN TRY
    INSERT INTO dbo.Complaints (complaintCode, title, description, categoryId, studentId, building, priority, status)
    VALUES (N'BAD-002', N'Test', N'Description', 1, 2, N'Building A', N'UltraCritical', N'Pending');
    PRINT 'FAIL: CK_Complaints_priority did not block invalid priority!';
END TRY
BEGIN CATCH
    PRINT 'PASS: CK_Complaints_priority successfully blocked invalid priority: ' + ERROR_MESSAGE();
END CATCH

-- Test 3.4: Duplicate Email Check
BEGIN TRY
    INSERT INTO dbo.Users (fullName, email, passwordHash, role)
    VALUES (N'Duplicate Ali', N'ali.khan@campusfix.edu', N'hash', N'student');
    PRINT 'FAIL: UQ_Users_email did not block duplicate email!';
END TRY
BEGIN CATCH
    PRINT 'PASS: UQ_Users_email successfully blocked duplicate email: ' + ERROR_MESSAGE();
END CATCH

-- Test 3.5: Foreign Key Integrity Check
BEGIN TRY
    INSERT INTO dbo.Complaints (complaintCode, title, description, categoryId, studentId, building, priority, status)
    VALUES (N'BAD-003', N'Test', N'Description', 99999, 2, N'Building A', N'High', N'Pending');
    PRINT 'FAIL: FK_Complaints_Categories did not block non-existent category!';
END TRY
BEGIN CATCH
    PRINT 'PASS: FK_Complaints_Categories successfully blocked invalid categoryId: ' + ERROR_MESSAGE();
END CATCH

-- 4. Verify Indexes
PRINT '4. Verifying Performance Indexes:';
SELECT 
    t.name AS TableName,
    i.name AS IndexName,
    i.type_desc AS IndexType,
    i.is_unique AS IsUnique
FROM sys.indexes i
INNER JOIN sys.tables t ON i.object_id = t.object_id
WHERE t.name IN ('Users', 'Departments', 'Categories', 'Complaints', 'ComplaintComments', 'ComplaintStatusHistory', 'ComplaintAssignments')
  AND i.name IS NOT NULL
ORDER BY t.name, i.name;

PRINT '=======================================================';
PRINT 'CAMPUSFIX DATABASE VERIFICATION SUITE FINISHED';
PRINT '=======================================================';
GO
