/**
 * CampusFix — Department Data Access Model
 * Implements parameterized queries for campus facility departments.
 */

const { executeQuery, sql } = require('../config/db');

const departmentModel = {
  /**
   * Retrieves all active campus facility departments.
   */
  async getAllActive() {
    const query = `
      SELECT id, name, contactEmail, officeLocation, isActive, createdAt
      FROM dbo.Departments
      WHERE isActive = 1
      ORDER BY name ASC;
    `;
    const result = await executeQuery(query);
    return result.recordset;
  },

  /**
   * Finds department by ID.
   */
  async findById(id) {
    const query = `
      SELECT id, name, contactEmail, officeLocation, isActive, createdAt
      FROM dbo.Departments
      WHERE id = @id;
    `;
    const params = [{ name: 'id', type: sql.Int, value: id }];
    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  }
};

module.exports = departmentModel;
