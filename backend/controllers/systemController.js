/**
 * CampusFix — System & Database Query Verification Controller
 * Demonstrates parameterized query execution via the data access layer.
 */

const { executeQuery, sql } = require('../config/db');
const apiResponse = require('../utils/apiResponse');

const systemController = {
  /**
   * Executes a parameterized diagnostic query against CampusFixDB.
   * GET /api/system/stats
   */
  async getSystemStats(req, res, next) {
    try {
      // Execute parameterized query verifying active categories & complaints
      const query = `
        SELECT 
          (SELECT COUNT(*) FROM dbo.Users WHERE isActive = @userActive) AS totalUsers,
          (SELECT COUNT(*) FROM dbo.Departments WHERE isActive = @deptActive) AS totalDepartments,
          (SELECT COUNT(*) FROM dbo.Categories WHERE isActive = @catActive) AS totalCategories,
          (SELECT COUNT(*) FROM dbo.Complaints) AS totalComplaints
      `;

      const params = [
        { name: 'userActive', type: sql.Bit, value: 1 },
        { name: 'deptActive', type: sql.Bit, value: 1 },
        { name: 'catActive', type: sql.Bit, value: 1 }
      ];

      const result = await executeQuery(query, params);
      const stats = result.recordset[0];

      return apiResponse.success(
        res,
        stats,
        'Database query executed successfully using parameterized inputs'
      );
    } catch (err) {
      next(err);
    }
  }
};

module.exports = systemController;
