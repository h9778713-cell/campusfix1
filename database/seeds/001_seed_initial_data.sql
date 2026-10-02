-- ============================================================================
-- Seed Data: 001_seed_initial_data.sql
-- Database: CampusFixDB
-- Engine: Microsoft SQL Server
-- Description: Inserts standard campus departments, problem categories,
--              administrative & student accounts (Ali, Sara, Hamna, Usman),
--              and sample complaints across all statuses and priorities.
-- ============================================================================

USE CampusFixDB;
GO

SET NOCOUNT ON;
PRINT 'Beginning seed data insertion...';

-- ============================================================================
-- 1. Departments
-- ============================================================================
MERGE dbo.Departments AS target
USING (VALUES 
    (N'IT & AV Support Services', N'itsupport@campusfix.edu', N'Tech Center, Room 101'),
    (N'Facilities & Physical Works', N'facilities@campusfix.edu', N'Operations Building, Ground Floor'),
    (N'Electrical & Power Systems', N'electrical@campusfix.edu', N'Substation Office, Block C'),
    (N'Water & Sanitation', N'plumbing@campusfix.edu', N'Maintenance Depot, Bay 2'),
    (N'Campus Security & Safety', N'security@campusfix.edu', N'Main Gate Command Post'),
    (N'General Administration', N'admin-office@campusfix.edu', N'Admin Block, 2nd Floor')
) AS source (name, contactEmail, officeLocation)
ON target.name = source.name
WHEN NOT MATCHED THEN
    INSERT (name, contactEmail, officeLocation, isActive, createdAt)
    VALUES (source.name, source.contactEmail, source.officeLocation, 1, SYSUTCDATETIME());

PRINT 'Departments seeded.';

-- ============================================================================
-- 2. Categories
-- ============================================================================
DECLARE @deptIT INT = (SELECT id FROM dbo.Departments WHERE name = N'IT & AV Support Services');
DECLARE @deptFacilities INT = (SELECT id FROM dbo.Departments WHERE name = N'Facilities & Physical Works');
DECLARE @deptElectrical INT = (SELECT id FROM dbo.Departments WHERE name = N'Electrical & Power Systems');
DECLARE @deptWater INT = (SELECT id FROM dbo.Departments WHERE name = N'Water & Sanitation');
DECLARE @deptSecurity INT = (SELECT id FROM dbo.Departments WHERE name = N'Campus Security & Safety');
DECLARE @deptAdmin INT = (SELECT id FROM dbo.Departments WHERE name = N'General Administration');

MERGE dbo.Categories AS target
USING (VALUES
    (N'Broken Projectors & AV Equipment', N'Projectors, display screens, HDMI wall plates, speakers, and classroom audio systems.', @deptIT),
    (N'Damaged Furniture', N'Desks, broken chairs, damaged podiums, laboratory stools, and classroom whiteboards.', @deptFacilities),
    (N'Wi-Fi & Network Issues', N'Campus Wi-Fi connectivity drops, slow internet, ethernet wall jack faults, and portal access problems.', @deptIT),
    (N'Electrical & Lighting Issues', N'Exposed wiring, faulty light switches, blackout in lecture halls, and tripping circuit breakers.', @deptElectrical),
    (N'Water & Plumbing Problems', N'Restroom leaks, blocked sinks, low water pressure, broken flush tanks, and drinking fountain issues.', @deptWater),
    (N'Cleanliness & Sanitation', N'Unemptied garbage bins, unsanitary restrooms, floor spills, and litter in campus corridors.', @deptFacilities),
    (N'Campus Security & Door Access', N'Damaged door locks, malfunctioning RFID turnstiles, dark parking areas, and missing window latches.', @deptSecurity),
    (N'Other Campus Problems', N'General facilities concerns not covered by the standard categories.', @deptAdmin)
) AS source (name, description, departmentId)
ON target.name = source.name
WHEN NOT MATCHED THEN
    INSERT (name, description, departmentId, isActive, createdAt)
    VALUES (source.name, source.description, source.departmentId, 1, SYSUTCDATETIME());

PRINT 'Categories seeded.';

-- ============================================================================
-- 3. Users (Admin + Development Students: Ali, Sara, Hamna, Usman)
-- Password for Admin: Admin@12345
-- Password for Students: Student@12345
-- Hash generated using bcryptjs with 12 rounds
-- ============================================================================
DECLARE @adminHash NVARCHAR(255) = N'$2a$12$7vh9dbiDGZGAyPXkqeWSzer2b2AjVbLZBn3jimQ.JHKxFuO2m9re2';
DECLARE @studentHash NVARCHAR(255) = N'$2a$12$2zM9whN2ygsB82eocPfpGuzqnE3.2kESErzFxtQ.tdkJjN3IUtSpC';

-- Admin User
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE email = N'admin@campusfix.edu')
BEGIN
    INSERT INTO dbo.Users (fullName, email, passwordHash, role, studentId, phone, isActive, createdAt, updatedAt)
    VALUES (N'Campus Facilities Admin', N'admin@campusfix.edu', @adminHash, N'admin', NULL, N'+1-555-0100', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
END

-- Student: Ali Khan
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE email = N'ali.khan@campusfix.edu')
BEGIN
    INSERT INTO dbo.Users (fullName, email, passwordHash, role, studentId, phone, isActive, createdAt, updatedAt)
    VALUES (N'Ali Khan', N'ali.khan@campusfix.edu', @studentHash, N'student', N'FA22-BCS-001', N'+1-555-0101', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
END

-- Student: Sara Ahmed
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE email = N'sara.ahmed@campusfix.edu')
BEGIN
    INSERT INTO dbo.Users (fullName, email, passwordHash, role, studentId, phone, isActive, createdAt, updatedAt)
    VALUES (N'Sara Ahmed', N'sara.ahmed@campusfix.edu', @studentHash, N'student', N'FA22-BCS-002', N'+1-555-0102', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
END

-- Student: Hamna Tariq
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE email = N'hamna.tariq@campusfix.edu')
BEGIN
    INSERT INTO dbo.Users (fullName, email, passwordHash, role, studentId, phone, isActive, createdAt, updatedAt)
    VALUES (N'Hamna Tariq', N'hamna.tariq@campusfix.edu', @studentHash, N'student', N'FA22-BCS-003', N'+1-555-0103', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
END

-- Student: Usman Malik
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE email = N'usman.malik@campusfix.edu')
BEGIN
    INSERT INTO dbo.Users (fullName, email, passwordHash, role, studentId, phone, isActive, createdAt, updatedAt)
    VALUES (N'Usman Malik', N'usman.malik@campusfix.edu', @studentHash, N'student', N'FA22-BCS-004', N'+1-555-0104', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
END

PRINT 'Users seeded (Admin, Ali, Sara, Hamna, Usman).';

-- ============================================================================
-- 4. Sample Complaints
-- ============================================================================
DECLARE @adminId INT = (SELECT id FROM dbo.Users WHERE email = N'admin@campusfix.edu');
DECLARE @aliId INT = (SELECT id FROM dbo.Users WHERE email = N'ali.khan@campusfix.edu');
DECLARE @saraId INT = (SELECT id FROM dbo.Users WHERE email = N'sara.ahmed@campusfix.edu');
DECLARE @hamnaId INT = (SELECT id FROM dbo.Users WHERE email = N'hamna.tariq@campusfix.edu');
DECLARE @usmanId INT = (SELECT id FROM dbo.Users WHERE email = N'usman.malik@campusfix.edu');

DECLARE @catProjector INT = (SELECT id FROM dbo.Categories WHERE name = N'Broken Projectors & AV Equipment');
DECLARE @catFurniture INT = (SELECT id FROM dbo.Categories WHERE name = N'Damaged Furniture');
DECLARE @catWiFi INT = (SELECT id FROM dbo.Categories WHERE name = N'Wi-Fi & Network Issues');
DECLARE @catElectrical INT = (SELECT id FROM dbo.Categories WHERE name = N'Electrical & Lighting Issues');
DECLARE @catWater INT = (SELECT id FROM dbo.Categories WHERE name = N'Water & Plumbing Problems');
DECLARE @catSecurity INT = (SELECT id FROM dbo.Categories WHERE name = N'Campus Security & Door Access');
DECLARE @catOther INT = (SELECT id FROM dbo.Categories WHERE name = N'Other Campus Problems');

-- Complaint 1: Ali Khan - Projector Issue (In Progress, High)
IF NOT EXISTS (SELECT 1 FROM dbo.Complaints WHERE complaintCode = N'CMP-2026-0001')
BEGIN
    INSERT INTO dbo.Complaints (
        complaintCode, title, description, categoryId, studentId, 
        building, roomNumber, priority, status, imageUrl, imageKey, createdAt, updatedAt
    ) VALUES (
        N'CMP-2026-0001',
        N'Main Auditorium Projector Discolored and Flickering',
        N'During the computer science lecture, the ceiling-mounted projector developed severe purple discoloration and began power cycling every 5 minutes.',
        @catProjector,
        @aliId,
        N'Academic Block A',
        N'Auditorium 1',
        N'High',
        N'In Progress',
        N'/uploads/sample-projector.jpg',
        N'sample-projector-uuid-1',
        DATEADD(DAY, -3, SYSUTCDATETIME()),
        DATEADD(HOUR, -6, SYSUTCDATETIME())
    );
END

-- Complaint 2: Sara Ahmed - Broken Furniture (Pending, Medium)
IF NOT EXISTS (SELECT 1 FROM dbo.Complaints WHERE complaintCode = N'CMP-2026-0002')
BEGIN
    INSERT INTO dbo.Complaints (
        complaintCode, title, description, categoryId, studentId, 
        building, roomNumber, priority, status, imageUrl, imageKey, createdAt, updatedAt
    ) VALUES (
        N'CMP-2026-0002',
        N'Broken Desk and Exposed Screws in Lab 304',
        N'Two wooden desks in the middle row have fractured armrests with sharp exposed screws that can cause physical scratch injuries or rip student bags.',
        @catFurniture,
        @saraId,
        N'Engineering Complex',
        N'Computer Lab 304',
        N'Medium',
        N'Pending',
        NULL,
        NULL,
        DATEADD(DAY, -1, SYSUTCDATETIME()),
        DATEADD(DAY, -1, SYSUTCDATETIME())
    );
END

-- Complaint 3: Hamna Tariq - Wi-Fi Down (In Progress, Critical)
IF NOT EXISTS (SELECT 1 FROM dbo.Complaints WHERE complaintCode = N'CMP-2026-0003')
BEGIN
    INSERT INTO dbo.Complaints (
        complaintCode, title, description, categoryId, studentId, 
        building, roomNumber, priority, status, imageUrl, imageKey, createdAt, updatedAt
    ) VALUES (
        N'CMP-2026-0003',
        N'Central Library 2nd Floor Wi-Fi Access Point Completely Down',
        N'The primary Cisco Access Point on the 2nd floor silent reading room has an amber flashing LED and is rejecting all student authentication attempts during exam week.',
        @catWiFi,
        @hamnaId,
        N'Central Library',
        N'2nd Floor Silent Hall',
        N'Critical',
        N'In Progress',
        NULL,
        NULL,
        DATEADD(HOUR, -18, SYSUTCDATETIME()),
        DATEADD(HOUR, -4, SYSUTCDATETIME())
    );
END

-- Complaint 4: Usman Malik - Plumbing Leak (Resolved, High)
IF NOT EXISTS (SELECT 1 FROM dbo.Complaints WHERE complaintCode = N'CMP-2026-0004')
BEGIN
    INSERT INTO dbo.Complaints (
        complaintCode, title, description, categoryId, studentId, 
        building, roomNumber, priority, status, imageUrl, imageKey, resolvedAt, createdAt, updatedAt
    ) VALUES (
        N'CMP-2026-0004',
        N'Severe Water Pipe Burst Under Restroom Sink',
        N'The cold water intake pipe under the wash basin has split and is flooding water across the hallway floor.',
        @catWater,
        @usmanId,
        N'Student Center',
        N'Washroom 102',
        N'High',
        N'Resolved',
        N'/uploads/sample-leak.jpg',
        N'sample-leak-uuid-2',
        DATEADD(HOUR, -2, SYSUTCDATETIME()),
        DATEADD(DAY, -2, SYSUTCDATETIME()),
        DATEADD(HOUR, -2, SYSUTCDATETIME())
    );
END

-- Complaint 5: Ali Khan - Exposed Wiring (Closed, Critical)
IF NOT EXISTS (SELECT 1 FROM dbo.Complaints WHERE complaintCode = N'CMP-2026-0005')
BEGIN
    INSERT INTO dbo.Complaints (
        complaintCode, title, description, categoryId, studentId, 
        building, roomNumber, priority, status, imageUrl, imageKey, resolvedAt, closedAt, createdAt, updatedAt
    ) VALUES (
        N'CMP-2026-0005',
        N'Exposed Live High-Voltage Wiring Near Fire Exit Stairwell',
        N'A metal electrical conduit was knocked loose, leaving bare 220V wires hanging across the stairwell railing on the 3rd floor.',
        @catElectrical,
        @aliId,
        N'Academic Block B',
        N'Stairwell C 3rd Floor',
        N'Critical',
        N'Closed',
        NULL,
        NULL,
        DATEADD(DAY, -4, SYSUTCDATETIME()),
        DATEADD(DAY, -3, SYSUTCDATETIME()),
        DATEADD(DAY, -5, SYSUTCDATETIME()),
        DATEADD(DAY, -3, SYSUTCDATETIME())
    );
END

-- Complaint 6: Sara Ahmed - Out of scope request (Rejected, Low)
IF NOT EXISTS (SELECT 1 FROM dbo.Complaints WHERE complaintCode = N'CMP-2026-0006')
BEGIN
    INSERT INTO dbo.Complaints (
        complaintCode, title, description, categoryId, studentId, 
        building, roomNumber, priority, status, imageUrl, imageKey, createdAt, updatedAt
    ) VALUES (
        N'CMP-2026-0006',
        N'Request to Repaint Lecture Hall in Pastel Green',
        N'Students in Section B feel that the current white wall paint causes too much glare in morning classes.',
        @catOther,
        @saraId,
        N'Humanities Wing',
        N'Room 105',
        N'Low',
        N'Rejected',
        NULL,
        NULL,
        DATEADD(DAY, -6, SYSUTCDATETIME()),
        DATEADD(DAY, -5, SYSUTCDATETIME())
    );
END

PRINT 'Sample complaints seeded (across Pending, In Progress, Resolved, Closed, Rejected).';

-- ============================================================================
-- 5. Complaint Comments
-- ============================================================================
DECLARE @cmp1Id INT = (SELECT id FROM dbo.Complaints WHERE complaintCode = N'CMP-2026-0001');
DECLARE @cmp3Id INT = (SELECT id FROM dbo.Complaints WHERE complaintCode = N'CMP-2026-0003');
DECLARE @cmp4Id INT = (SELECT id FROM dbo.Complaints WHERE complaintCode = N'CMP-2026-0004');
DECLARE @cmp5Id INT = (SELECT id FROM dbo.Complaints WHERE complaintCode = N'CMP-2026-0005');
DECLARE @cmp6Id INT = (SELECT id FROM dbo.Complaints WHERE complaintCode = N'CMP-2026-0006');

IF NOT EXISTS (SELECT 1 FROM dbo.ComplaintComments WHERE complaintId = @cmp1Id)
BEGIN
    INSERT INTO dbo.ComplaintComments (complaintId, userId, commentText, isAdminOnly, createdAt)
    VALUES 
        (@cmp1Id, @adminId, N'AV support team dispatched. Spare optical engine and lamp retrieved from inventory.', 0, DATEADD(DAY, -2, SYSUTCDATETIME())),
        (@cmp1Id, @aliId, N'Thank you. We have a guest speaker session on Thursday, so this is very urgent for us.', 0, DATEADD(DAY, -2, DATEADD(MINUTE, 30, SYSUTCDATETIME()))),
        (@cmp1Id, @adminId, N'Technician confirmed work will conclude before 5 PM today.', 0, DATEADD(HOUR, -6, SYSUTCDATETIME()));
END

IF NOT EXISTS (SELECT 1 FROM dbo.ComplaintComments WHERE complaintId = @cmp4Id)
BEGIN
    INSERT INTO dbo.ComplaintComments (complaintId, userId, commentText, isAdminOnly, createdAt)
    VALUES 
        (@cmp4Id, @adminId, N'Plumbing team replaced the fractured PVC elbow pipe and clamped the shutoff valve.', 0, DATEADD(HOUR, -2, SYSUTCDATETIME()));
END

IF NOT EXISTS (SELECT 1 FROM dbo.ComplaintComments WHERE complaintId = @cmp6Id)
BEGIN
    INSERT INTO dbo.ComplaintComments (complaintId, userId, commentText, isAdminOnly, createdAt)
    VALUES 
        (@cmp6Id, @adminId, N'Aesthetic and wall color modifications are handled during the annual university summer renovation cycle. Individual student room repaint requests cannot be processed through this portal.', 0, DATEADD(DAY, -5, SYSUTCDATETIME()));
END

PRINT 'Complaint comments seeded.';

-- ============================================================================
-- 6. Complaint Status History (Audit Trail)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM dbo.ComplaintStatusHistory WHERE complaintId = @cmp1Id)
BEGIN
    INSERT INTO dbo.ComplaintStatusHistory (complaintId, oldStatus, newStatus, changedByUserId, remarks, changedAt)
    VALUES 
        (@cmp1Id, NULL, N'Pending', @aliId, N'Complaint submitted by student.', DATEADD(DAY, -3, SYSUTCDATETIME())),
        (@cmp1Id, N'Pending', N'In Progress', @adminId, N'Assigned to IT & AV Support Services for hardware inspection.', DATEADD(DAY, -2, SYSUTCDATETIME()));
END

IF NOT EXISTS (SELECT 1 FROM dbo.ComplaintStatusHistory WHERE complaintId = @cmp3Id)
BEGIN
    INSERT INTO dbo.ComplaintStatusHistory (complaintId, oldStatus, newStatus, changedByUserId, remarks, changedAt)
    VALUES 
        (@cmp3Id, NULL, N'Pending', @hamnaId, N'Complaint submitted by student.', DATEADD(HOUR, -18, SYSUTCDATETIME())),
        (@cmp3Id, N'Pending', N'In Progress', @adminId, N'Network engineer dispatched with replacement PoE switch.', DATEADD(HOUR, -4, SYSUTCDATETIME()));
END

IF NOT EXISTS (SELECT 1 FROM dbo.ComplaintStatusHistory WHERE complaintId = @cmp4Id)
BEGIN
    INSERT INTO dbo.ComplaintStatusHistory (complaintId, oldStatus, newStatus, changedByUserId, remarks, changedAt)
    VALUES 
        (@cmp4Id, NULL, N'Pending', @usmanId, N'Complaint submitted by student.', DATEADD(DAY, -2, SYSUTCDATETIME())),
        (@cmp4Id, N'Pending', N'In Progress', @adminId, N'Emergency plumbing crew assigned.', DATEADD(DAY, -1, SYSUTCDATETIME())),
        (@cmp4Id, N'In Progress', N'Resolved', @adminId, N'Pipe replaced, tested, and dried.', DATEADD(HOUR, -2, SYSUTCDATETIME()));
END

IF NOT EXISTS (SELECT 1 FROM dbo.ComplaintStatusHistory WHERE complaintId = @cmp5Id)
BEGIN
    INSERT INTO dbo.ComplaintStatusHistory (complaintId, oldStatus, newStatus, changedByUserId, remarks, changedAt)
    VALUES 
        (@cmp5Id, NULL, N'Pending', @aliId, N'Hazard reported.', DATEADD(DAY, -5, SYSUTCDATETIME())),
        (@cmp5Id, N'Pending', N'In Progress', @adminId, N'Emergency power isolation performed.', DATEADD(DAY, -4, SYSUTCDATETIME())),
        (@cmp5Id, N'In Progress', N'Resolved', @adminId, N'Steel junction box secured with padlock.', DATEADD(DAY, -4, SYSUTCDATETIME())),
        (@cmp5Id, N'Resolved', N'Closed', @adminId, N'Safety inspection certified complete.', DATEADD(DAY, -3, SYSUTCDATETIME()));
END

IF NOT EXISTS (SELECT 1 FROM dbo.ComplaintStatusHistory WHERE complaintId = @cmp6Id)
BEGIN
    INSERT INTO dbo.ComplaintStatusHistory (complaintId, oldStatus, newStatus, changedByUserId, remarks, changedAt)
    VALUES 
        (@cmp6Id, NULL, N'Pending', @saraId, N'Complaint submitted by student.', DATEADD(DAY, -6, SYSUTCDATETIME())),
        (@cmp6Id, N'Pending', N'Rejected', @adminId, N'Out of scope for facility grievances.', DATEADD(DAY, -5, SYSUTCDATETIME()));
END

PRINT 'Complaint status history seeded.';

-- ============================================================================
-- 7. Complaint Department Assignments
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM dbo.ComplaintAssignments WHERE complaintId = @cmp1Id)
BEGIN
    INSERT INTO dbo.ComplaintAssignments (complaintId, departmentId, assignedToUserId, assignedByUserId, assignmentNotes, assignedAt, isActive)
    VALUES (@cmp1Id, @deptIT, NULL, @adminId, N'Inspect projector lens and optical engine; replace lamp if burnt out.', DATEADD(DAY, -2, SYSUTCDATETIME()), 1);
END

IF NOT EXISTS (SELECT 1 FROM dbo.ComplaintAssignments WHERE complaintId = @cmp3Id)
BEGIN
    INSERT INTO dbo.ComplaintAssignments (complaintId, departmentId, assignedToUserId, assignedByUserId, assignmentNotes, assignedAt, isActive)
    VALUES (@cmp3Id, @deptIT, NULL, @adminId, N'Reboot controller or replace Cisco AP2802 unit.', DATEADD(HOUR, -4, SYSUTCDATETIME()), 1);
END

IF NOT EXISTS (SELECT 1 FROM dbo.ComplaintAssignments WHERE complaintId = @cmp4Id)
BEGIN
    INSERT INTO dbo.ComplaintAssignments (complaintId, departmentId, assignedToUserId, assignedByUserId, assignmentNotes, assignedAt, isActive)
    VALUES (@cmp4Id, @deptWater, NULL, @adminId, N'Emergency shutoff and PVC replacement.', DATEADD(DAY, -1, SYSUTCDATETIME()), 1);
END

PRINT 'Complaint assignments seeded.';

PRINT '=======================================================';
PRINT 'CampusFix seed data completed successfully!';
PRINT '=======================================================';
GO
