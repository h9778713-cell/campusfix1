/**
 * CampusFix — Admin Analytics Data Access Model
 * Implements high-performance parameterized SQL Server aggregations for
 * dashboard metrics, distribution breakdowns, activity streams, and workloads.
 */

const { executeQuery, sql } = require('../config/db');

const analyticsModel = {
  /**
   * Retrieves high-level metric card statistics.
   */
  async getOverviewStats() {
    const query = `
      SELECT 
        COUNT(*) AS totalComplaints,
        ISNULL(SUM(CASE WHEN c.status = 'Pending' THEN 1 ELSE 0 END), 0) AS pendingCount,
        ISNULL(SUM(CASE WHEN c.status = 'In Progress' THEN 1 ELSE 0 END), 0) AS inProgressCount,
        ISNULL(SUM(CASE WHEN c.status = 'Resolved' THEN 1 ELSE 0 END), 0) AS resolvedCount,
        ISNULL(SUM(CASE WHEN c.status = 'Closed' THEN 1 ELSE 0 END), 0) AS closedCount,
        ISNULL(SUM(CASE WHEN c.status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejectedCount,
        ISNULL(SUM(CASE WHEN c.priority = 'Critical' THEN 1 ELSE 0 END), 0) AS criticalCount,
        ISNULL(SUM(CASE WHEN c.status IN ('Pending', 'In Progress') AND activeAssign.complaintId IS NULL THEN 1 ELSE 0 END), 0) AS unassignedCount
      FROM dbo.Complaints c
      LEFT JOIN (
        SELECT DISTINCT complaintId 
        FROM dbo.ComplaintAssignments 
        WHERE isActive = 1
      ) activeAssign ON c.id = activeAssign.complaintId;
    `;
    const result = await executeQuery(query, []);
    return result.recordset[0] || {
      totalComplaints: 0,
      pendingCount: 0,
      inProgressCount: 0,
      resolvedCount: 0,
      closedCount: 0,
      rejectedCount: 0,
      criticalCount: 0,
      unassignedCount: 0
    };
  },

  /**
   * Retrieves breakdown of complaints by status with percentages.
   */
  async getStatusDistribution() {
    const query = `
      SELECT 
        status,
        COUNT(*) AS count,
        ROUND(CAST(COUNT(*) AS FLOAT) * 100.0 / NULLIF((SELECT COUNT(*) FROM dbo.Complaints), 0), 1) AS percentage
      FROM dbo.Complaints
      GROUP BY status
      ORDER BY 
        CASE status
          WHEN 'Pending' THEN 1
          WHEN 'In Progress' THEN 2
          WHEN 'Resolved' THEN 3
          WHEN 'Closed' THEN 4
          WHEN 'Rejected' THEN 5
          ELSE 6
        END;
    `;
    const result = await executeQuery(query, []);
    return result.recordset;
  },

  /**
   * Retrieves breakdown of complaints by priority with percentages.
   */
  async getPriorityDistribution() {
    const query = `
      SELECT 
        priority,
        COUNT(*) AS count,
        ROUND(CAST(COUNT(*) AS FLOAT) * 100.0 / NULLIF((SELECT COUNT(*) FROM dbo.Complaints), 0), 1) AS percentage
      FROM dbo.Complaints
      GROUP BY priority
      ORDER BY 
        CASE priority
          WHEN 'Critical' THEN 1
          WHEN 'High' THEN 2
          WHEN 'Medium' THEN 3
          WHEN 'Low' THEN 4
          ELSE 5
        END;
    `;
    const result = await executeQuery(query, []);
    return result.recordset;
  },

  /**
   * Retrieves complaint counts across all active categories.
   */
  async getCategoryDistribution() {
    const query = `
      SELECT 
        cat.id AS categoryId,
        cat.name AS categoryName,
        d.name AS departmentName,
        COUNT(c.id) AS count,
        ISNULL(SUM(CASE WHEN c.status IN ('Pending', 'In Progress') THEN 1 ELSE 0 END), 0) AS activeCount
      FROM dbo.Categories cat
      LEFT JOIN dbo.Departments d ON cat.departmentId = d.id
      LEFT JOIN dbo.Complaints c ON cat.id = c.categoryId
      WHERE cat.isActive = 1
      GROUP BY cat.id, cat.name, d.name
      ORDER BY count DESC, cat.name ASC;
    `;
    const result = await executeQuery(query, []);
    return result.recordset;
  },

  /**
   * Retrieves complaint counts across top buildings/locations.
   */
  async getLocationDistribution(limit = 8) {
    const query = `
      SELECT TOP (@limit)
        building,
        COUNT(*) AS totalComplaints,
        ISNULL(SUM(CASE WHEN status IN ('Pending', 'In Progress') THEN 1 ELSE 0 END), 0) AS activeCount,
        ISNULL(SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END), 0) AS resolvedCount,
        ISNULL(SUM(CASE WHEN priority = 'Critical' THEN 1 ELSE 0 END), 0) AS criticalCount
      FROM dbo.Complaints
      GROUP BY building
      ORDER BY totalComplaints DESC;
    `;
    const params = [{ name: 'limit', type: sql.Int, value: Math.max(1, limit) }];
    const result = await executeQuery(query, params);
    return result.recordset;
  },

  /**
   * Retrieves complaint trends over time (daily counts).
   */
  async getTrends(days = 14) {
    const query = `
      SELECT 
        CONVERT(VARCHAR(10), createdAt, 120) AS dateStr,
        COUNT(*) AS filedCount,
        ISNULL(SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END), 0) AS resolvedCount
      FROM dbo.Complaints
      WHERE createdAt >= DATEADD(DAY, -@days, SYSUTCDATETIME())
      GROUP BY CONVERT(VARCHAR(10), createdAt, 120)
      ORDER BY dateStr ASC;
    `;
    const params = [{ name: 'days', type: sql.Int, value: Math.max(1, days) }];
    const result = await executeQuery(query, params);
    return result.recordset;
  },

  /**
   * Retrieves active department workloads.
   */
  async getDepartmentWorkload() {
    const query = `
      SELECT 
        d.id AS departmentId,
        d.name AS departmentName,
        COUNT(a.id) AS activeAssignments,
        ISNULL(SUM(CASE WHEN c.priority = 'Critical' THEN 1 ELSE 0 END), 0) AS criticalAssignments
      FROM dbo.Departments d
      LEFT JOIN dbo.ComplaintAssignments a ON d.id = a.departmentId AND a.isActive = 1
      LEFT JOIN dbo.Complaints c ON a.complaintId = c.id AND c.status NOT IN ('Closed', 'Rejected')
      WHERE d.isActive = 1
      GROUP BY d.id, d.name
      ORDER BY activeAssignments DESC, d.name ASC;
    `;
    const result = await executeQuery(query, []);
    return result.recordset;
  },

  /**
   * Retrieves real-time recent activity stream (status transitions, assignments, comments).
   */
  async getRecentActivity(limit = 10) {
    const query = `
      SELECT TOP (@limit)
        activityType,
        complaintId,
        complaintCode,
        complaintTitle,
        actorName,
        actorRole,
        details,
        activityAt
      FROM (
        -- Status updates
        SELECT 
          'status_change' AS activityType,
          c.id AS complaintId,
          c.complaintCode,
          c.title AS complaintTitle,
          u.fullName AS actorName,
          u.role AS actorRole,
          CONCAT('Status changed to ', sh.newStatus, CASE WHEN sh.remarks IS NOT NULL AND LEN(sh.remarks) > 0 THEN CONCAT(': ', sh.remarks) ELSE '' END) AS details,
          sh.changedAt AS activityAt
        FROM dbo.ComplaintStatusHistory sh
        INNER JOIN dbo.Complaints c ON sh.complaintId = c.id
        INNER JOIN dbo.Users u ON sh.changedByUserId = u.id

        UNION ALL

        -- Department assignments
        SELECT 
          'assignment' AS activityType,
          c.id AS complaintId,
          c.complaintCode,
          c.title AS complaintTitle,
          u.fullName AS actorName,
          u.role AS actorRole,
          CONCAT('Assigned to ', d.name, CASE WHEN a.assignmentNotes IS NOT NULL AND LEN(a.assignmentNotes) > 0 THEN CONCAT(' (', a.assignmentNotes, ')') ELSE '' END) AS details,
          a.assignedAt AS activityAt
        FROM dbo.ComplaintAssignments a
        INNER JOIN dbo.Complaints c ON a.complaintId = c.id
        INNER JOIN dbo.Departments d ON a.departmentId = d.id
        INNER JOIN dbo.Users u ON a.assignedByUserId = u.id

        UNION ALL

        -- Threaded comments and internal staff notes
        SELECT 
          CASE WHEN cc.isAdminOnly = 1 THEN 'internal_note' ELSE 'comment' END AS activityType,
          c.id AS complaintId,
          c.complaintCode,
          c.title AS complaintTitle,
          u.fullName AS actorName,
          u.role AS actorRole,
          CASE 
            WHEN LEN(cc.commentText) > 90 THEN CONCAT(SUBSTRING(cc.commentText, 1, 87), '...') 
            ELSE cc.commentText 
          END AS details,
          cc.createdAt AS activityAt
        FROM dbo.ComplaintComments cc
        INNER JOIN dbo.Complaints c ON cc.complaintId = c.id
        INNER JOIN dbo.Users u ON cc.userId = u.id
      ) activityStream
      ORDER BY activityAt DESC;
    `;
    const params = [{ name: 'limit', type: sql.Int, value: Math.max(1, limit) }];
    const result = await executeQuery(query, params);
    return result.recordset;
  },

  /**
   * Retrieves complete analytics payload in a single consolidated call.
   */
  async getFullAnalyticsSuite() {
    const [overview, byStatus, byPriority, byCategory, byLocation, trends, workload, recentActivity] = await Promise.all([
      this.getOverviewStats(),
      this.getStatusDistribution(),
      this.getPriorityDistribution(),
      this.getCategoryDistribution(),
      this.getLocationDistribution(8),
      this.getTrends(14),
      this.getDepartmentWorkload(),
      this.getRecentActivity(10)
    ]);

    return {
      overview,
      byStatus,
      byPriority,
      byCategory,
      byLocation,
      trends,
      workload,
      recentActivity
    };
  }
};

module.exports = analyticsModel;
