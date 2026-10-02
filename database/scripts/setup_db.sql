-- ============================================================================
-- CampusFix Database Initialization Script
-- Target: Microsoft SQL Server 2017+ / 2022 / 2025
-- Description: Creates the CampusFixDB database with optimal concurrency settings.
-- ============================================================================

USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'CampusFixDB')
BEGIN
    PRINT 'Creating database CampusFixDB...';
    CREATE DATABASE CampusFixDB;
    PRINT 'CampusFixDB created successfully.';
END
ELSE
BEGIN
    PRINT 'Database CampusFixDB already exists.';
END
GO

USE CampusFixDB;
GO

-- Enable Read-Committed Snapshot Isolation for high-concurrency non-blocking reads
IF (SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = N'CampusFixDB') = 0
BEGIN
    ALTER DATABASE CampusFixDB SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
    PRINT 'Enabled READ_COMMITTED_SNAPSHOT on CampusFixDB.';
END
GO

IF (SELECT snapshot_isolation_state FROM sys.databases WHERE name = N'CampusFixDB') <> 1
BEGIN
    ALTER DATABASE CampusFixDB SET ALLOW_SNAPSHOT_ISOLATION ON;
    PRINT 'Enabled ALLOW_SNAPSHOT_ISOLATION on CampusFixDB.';
END
GO

PRINT 'Database configuration verified.';
GO
