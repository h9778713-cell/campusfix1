/**
 * CampusFix — Category Data Access Model
 * Implements parameterized queries for categories.
 */

const { executeQuery, sql } = require('../config/db');

const categoryModel = {
  /**
   * Retrieves all active categories with associated department details.
   */
  async getAllActive() {
    const query = `
      SELECT 
        c.id, 
        c.name, 
        c.description, 
        c.departmentId, 
        d.name AS departmentName,
        c.isActive, 
        c.createdAt
      FROM dbo.Categories c
      INNER JOIN dbo.Departments d ON c.departmentId = d.id
      WHERE c.isActive = 1
      ORDER BY c.name ASC;
    `;
    const result = await executeQuery(query);
    return result.recordset;
  },

  /**
   * Finds category by ID.
   */
  async findById(id) {
    const query = `
      SELECT id, name, description, departmentId, isActive, createdAt
      FROM dbo.Categories
      WHERE id = @id;
    `;
    const params = [{ name: 'id', type: sql.Int, value: id }];
    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  }
};

module.exports = categoryModel;
