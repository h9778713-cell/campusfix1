/**
 * CampusFix — User Data Access Model
 * Implements strict parameterized queries for all user interactions.
 */

const { executeQuery, sql } = require('../config/db');

const userModel = {
  /**
   * Finds a user by email (used during authentication).
   * Returns passwordHash for verification.
   * @param {string} email
   * @returns {Promise<object|null>}
   */
  async findByEmail(email) {
    const query = `
      SELECT id, fullName, email, passwordHash, role, studentId, phone, isActive, createdAt, updatedAt
      FROM dbo.Users
      WHERE email = @email;
    `;

    const params = [
      { name: 'email', type: sql.NVarChar(255), value: email.toLowerCase().trim() }
    ];

    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  },

  /**
   * Finds a user by surrogate ID (used by authentication middleware).
   * Explicitly omits passwordHash for security.
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const query = `
      SELECT id, fullName, email, role, studentId, phone, isActive, createdAt, updatedAt
      FROM dbo.Users
      WHERE id = @id;
    `;

    const params = [
      { name: 'id', type: sql.Int, value: id }
    ];

    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  },

  /**
   * Checks if an email or student ID is already registered.
   * @param {string} email
   * @param {string} studentId
   * @returns {Promise<{emailExists: boolean, studentIdExists: boolean}>}
   */
  async checkDuplicates(email, studentId) {
    const query = `
      SELECT 
        (SELECT COUNT(*) FROM dbo.Users WHERE email = @email) AS emailCount,
        (SELECT COUNT(*) FROM dbo.Users WHERE studentId = @studentId AND studentId IS NOT NULL) AS studentIdCount;
    `;

    const params = [
      { name: 'email', type: sql.NVarChar(255), value: email.toLowerCase().trim() },
      { name: 'studentId', type: sql.NVarChar(50), value: studentId.trim() }
    ];

    const result = await executeQuery(query, params);
    const row = result.recordset[0];

    return {
      emailExists: row.emailCount > 0,
      studentIdExists: row.studentIdCount > 0
    };
  },

  /**
   * Creates a new Student account.
   * Strictly enforces role = 'student' at the database query level.
   * Returns sanitized record omitting passwordHash.
   *
   * @param {object} studentData
   * @returns {Promise<object>}
   */
  async createStudent({ fullName, email, passwordHash, studentId, phone }) {
    const query = `
      INSERT INTO dbo.Users (
        fullName, email, passwordHash, role, studentId, phone, isActive, createdAt, updatedAt
      )
      OUTPUT 
        inserted.id, 
        inserted.fullName, 
        inserted.email, 
        inserted.role, 
        inserted.studentId, 
        inserted.phone, 
        inserted.isActive,
        inserted.createdAt
      VALUES (
        @fullName, @email, @passwordHash, @role, @studentId, @phone, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
      );
    `;

    const params = [
      { name: 'fullName', type: sql.NVarChar(150), value: fullName.trim() },
      { name: 'email', type: sql.NVarChar(255), value: email.toLowerCase().trim() },
      { name: 'passwordHash', type: sql.NVarChar(255), value: passwordHash },
      { name: 'role', type: sql.NVarChar(20), value: 'student' }, // Enforced server-side
      { name: 'studentId', type: sql.NVarChar(50), value: studentId.trim() },
      { name: 'phone', type: sql.NVarChar(25), value: phone ? phone.trim() : null }
    ];

    const result = await executeQuery(query, params);
    return result.recordset[0];
  }
};

module.exports = userModel;
