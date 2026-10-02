/**
 * CampusFix — Complaint Data Access Model
 * Implements strict parameterized queries and ACID transactions for
 * complaint lifecycle, status history, comments, and assignments.
 */

const { getPool, executeQuery, sql } = require('../config/db');

const complaintModel = {
  /**
   * Generates a unique complaint reference code (e.g. CMP-2026-A1B2)
   */
  async generateComplaintCode() {
    const year = new Date().getFullYear();
    const randomHex = Math.floor(1000 + Math.random() * 9000).toString();
    const code = `CMP-${year}-${randomHex}`;

    // Verify uniqueness
    const check = await executeQuery(
      'SELECT id FROM dbo.Complaints WHERE complaintCode = @code',
      [{ name: 'code', type: sql.NVarChar(30), value: code }]
    );

    if (check.recordset.length > 0) {
      return this.generateComplaintCode();
    }
    return code;
  },

  /**
   * Creates a new complaint and writes initial status history in a single transaction.
   */
  async create({ title, description, categoryId, studentId, building, roomNumber, priority, imageUrl, imageKey }) {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const complaintCode = await this.generateComplaintCode();

      // 1. Insert Complaint
      const insertRequest = new sql.Request(transaction);
      insertRequest.input('complaintCode', sql.NVarChar(30), complaintCode);
      insertRequest.input('title', sql.NVarChar(200), title);
      insertRequest.input('description', sql.NVarChar(sql.MAX), description);
      insertRequest.input('categoryId', sql.Int, categoryId);
      insertRequest.input('studentId', sql.Int, studentId);
      insertRequest.input('building', sql.NVarChar(120), building);
      insertRequest.input('roomNumber', sql.NVarChar(50), roomNumber);
      insertRequest.input('priority', sql.NVarChar(20), priority);
      insertRequest.input('status', sql.NVarChar(20), 'Pending');
      insertRequest.input('imageUrl', sql.NVarChar(500), imageUrl);
      insertRequest.input('imageKey', sql.NVarChar(255), imageKey);

      const insertResult = await insertRequest.query(`
        INSERT INTO dbo.Complaints (
          complaintCode, title, description, categoryId, studentId, building, 
          roomNumber, priority, status, imageUrl, imageKey, createdAt, updatedAt
        )
        OUTPUT 
          inserted.id,
          inserted.complaintCode,
          inserted.title,
          inserted.description,
          inserted.categoryId,
          inserted.studentId,
          inserted.building,
          inserted.roomNumber,
          inserted.priority,
          inserted.status,
          inserted.imageUrl,
          inserted.imageKey,
          inserted.createdAt,
          inserted.updatedAt
        VALUES (
          @complaintCode, @title, @description, @categoryId, @studentId, @building, 
          @roomNumber, @priority, @status, @imageUrl, @imageKey, SYSUTCDATETIME(), SYSUTCDATETIME()
        );
      `);

      const createdComplaint = insertResult.recordset[0];

      // 2. Insert Initial Status History
      const historyRequest = new sql.Request(transaction);
      historyRequest.input('complaintId', sql.Int, createdComplaint.id);
      historyRequest.input('oldStatus', sql.NVarChar(20), null);
      historyRequest.input('newStatus', sql.NVarChar(20), 'Pending');
      historyRequest.input('changedByUserId', sql.Int, studentId);
      historyRequest.input('remarks', sql.NVarChar(500), 'Complaint submitted by student.');

      await historyRequest.query(`
        INSERT INTO dbo.ComplaintStatusHistory (
          complaintId, oldStatus, newStatus, changedByUserId, remarks, changedAt
        ) VALUES (
          @complaintId, @oldStatus, @newStatus, @changedByUserId, @remarks, SYSUTCDATETIME()
        );
      `);

      await transaction.commit();
      return createdComplaint;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  /**
   * Retrieves full details of a complaint by ID.
   */
  async findById(id) {
    const query = `
      SELECT 
        c.id,
        c.complaintCode,
        c.title,
        c.description,
        c.categoryId,
        cat.name AS categoryName,
        d.id AS departmentId,
        d.name AS departmentName,
        c.studentId,
        u.fullName AS studentName,
        u.email AS studentEmail,
        u.studentId AS studentRollNumber,
        u.phone AS studentPhone,
        c.building,
        c.roomNumber,
        c.priority,
        c.status,
        c.imageUrl,
        c.imageKey,
        c.resolvedAt,
        c.closedAt,
        c.createdAt,
        c.updatedAt
      FROM dbo.Complaints c
      INNER JOIN dbo.Categories cat ON c.categoryId = cat.id
      INNER JOIN dbo.Departments d ON cat.departmentId = d.id
      INNER JOIN dbo.Users u ON c.studentId = u.id
      WHERE c.id = @id;
    `;

    const params = [{ name: 'id', type: sql.Int, value: id }];
    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  },

  /**
   * Retrieves paginated complaints filed by a specific student.
   */
  async findStudentComplaints({ studentId, status, priority, categoryId, search, page = 1, limit = 10 }) {
    const offset = (page - 1) * limit;
    const params = [
      { name: 'studentId', type: sql.Int, value: studentId },
      { name: 'offset', type: sql.Int, value: offset },
      { name: 'limit', type: sql.Int, value: limit }
    ];

    let whereClause = 'WHERE c.studentId = @studentId';

    if (status) {
      whereClause += ' AND c.status = @status';
      params.push({ name: 'status', type: sql.NVarChar(20), value: status });
    }

    if (priority) {
      whereClause += ' AND c.priority = @priority';
      params.push({ name: 'priority', type: sql.NVarChar(20), value: priority });
    }

    if (categoryId) {
      whereClause += ' AND c.categoryId = @categoryId';
      params.push({ name: 'categoryId', type: sql.Int, value: categoryId });
    }

    if (search) {
      whereClause += ' AND (c.title LIKE @searchPattern OR c.complaintCode LIKE @searchPattern OR c.building LIKE @searchPattern OR c.description LIKE @searchPattern)';
      params.push({ name: 'searchPattern', type: sql.NVarChar(200), value: `%${search}%` });
    }

    const query = `
      SELECT 
        c.id,
        c.complaintCode,
        c.title,
        c.description,
        c.categoryId,
        cat.name AS categoryName,
        d.name AS departmentName,
        c.building,
        c.roomNumber,
        c.priority,
        c.status,
        c.imageUrl,
        c.resolvedAt,
        c.closedAt,
        c.createdAt,
        c.updatedAt,
        COUNT(*) OVER() AS totalRecords
      FROM dbo.Complaints c
      INNER JOIN dbo.Categories cat ON c.categoryId = cat.id
      INNER JOIN dbo.Departments d ON cat.departmentId = d.id
      ${whereClause}
      ORDER BY c.createdAt DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY;
    `;

    const result = await executeQuery(query, params);
    const records = result.recordset;
    const totalRecords = records.length > 0 ? records[0].totalRecords : 0;

    return {
      complaints: records.map(r => {
        const { totalRecords, ...item } = r;
        return item;
      }),
      total: totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
      pagination: {
        total: totalRecords,
        page,
        limit,
        totalPages: Math.ceil(totalRecords / limit)
      }
    };
  },

  /**
   * Retrieves all campus complaints for administration with full filtering and sorting.
   */
  async findAllComplaints({ status, priority, categoryId, departmentId, building, search, sortBy = 'createdAt', sortOrder = 'DESC', page = 1, limit = 10 }) {
    const offset = (page - 1) * limit;
    const params = [
      { name: 'offset', type: sql.Int, value: offset },
      { name: 'limit', type: sql.Int, value: limit }
    ];

    let whereConditions = [];

    if (status) {
      whereConditions.push('c.status = @status');
      params.push({ name: 'status', type: sql.NVarChar(20), value: status });
    }

    if (priority) {
      whereConditions.push('c.priority = @priority');
      params.push({ name: 'priority', type: sql.NVarChar(20), value: priority });
    }

    if (categoryId) {
      whereConditions.push('c.categoryId = @categoryId');
      params.push({ name: 'categoryId', type: sql.Int, value: categoryId });
    }

    if (departmentId) {
      whereConditions.push('cat.departmentId = @departmentId');
      params.push({ name: 'departmentId', type: sql.Int, value: departmentId });
    }

    if (building) {
      whereConditions.push('c.building = @building');
      params.push({ name: 'building', type: sql.NVarChar(120), value: building });
    }

    if (search) {
      whereConditions.push('(c.title LIKE @searchPattern OR c.complaintCode LIKE @searchPattern OR c.building LIKE @searchPattern OR u.fullName LIKE @searchPattern OR u.studentId LIKE @searchPattern)');
      params.push({ name: 'searchPattern', type: sql.NVarChar(200), value: `%${search}%` });
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Sanitize sort parameters
    const safeSortCols = {
      createdAt: 'c.createdAt',
      priority: 'c.priority',
      status: 'c.status',
      title: 'c.title'
    };
    const orderColumn = safeSortCols[sortBy] || 'c.createdAt';
    const orderDir = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const query = `
      SELECT 
        c.id,
        c.complaintCode,
        c.title,
        c.description,
        c.categoryId,
        cat.name AS categoryName,
        d.id AS departmentId,
        d.name AS departmentName,
        c.studentId,
        u.fullName AS studentName,
        u.email AS studentEmail,
        u.studentId AS studentRollNumber,
        c.building,
        c.roomNumber,
        c.priority,
        c.status,
        c.imageUrl,
        c.resolvedAt,
        c.closedAt,
        c.createdAt,
        c.updatedAt,
        (SELECT COUNT(*) FROM dbo.ComplaintComments cc WHERE cc.complaintId = c.id) AS commentCount,
        a.departmentId AS assignedDepartmentId,
        ad.name AS assignedDepartmentName,
        COUNT(*) OVER() AS totalRecords
      FROM dbo.Complaints c
      INNER JOIN dbo.Categories cat ON c.categoryId = cat.id
      INNER JOIN dbo.Departments d ON cat.departmentId = d.id
      INNER JOIN dbo.Users u ON c.studentId = u.id
      LEFT JOIN dbo.ComplaintAssignments a ON c.id = a.complaintId AND a.isActive = 1
      LEFT JOIN dbo.Departments ad ON a.departmentId = ad.id
      ${whereClause}
      ORDER BY ${orderColumn} ${orderDir}
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY;
    `;

    const result = await executeQuery(query, params);
    const records = result.recordset;
    const totalRecords = records.length > 0 ? records[0].totalRecords : 0;

    return {
      complaints: records.map(r => {
        const { totalRecords, ...item } = r;
        return item;
      }),
      total: totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
      pagination: {
        total: totalRecords,
        page,
        limit,
        totalPages: Math.ceil(totalRecords / limit)
      }
    };
  },

  /**
   * Updates complaint status and records status history inside a transaction.
   */
  async updateStatus({ id, status, adminId, remarks }) {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // Get current status
      const currentReq = new sql.Request(transaction);
      currentReq.input('id', sql.Int, id);
      const currentRes = await currentReq.query('SELECT status FROM dbo.Complaints WHERE id = @id');

      if (currentRes.recordset.length === 0) {
        await transaction.rollback();
        return null;
      }

      const oldStatus = currentRes.recordset[0].status;

      if (oldStatus === status) {
        await transaction.rollback();
        const err = new Error(`Complaint is already in "${status}" status.`);
        err.code = 'STATUS_UNCHANGED';
        err.statusCode = 400;
        throw err;
      }

      // Update complaint
      const updateReq = new sql.Request(transaction);
      updateReq.input('id', sql.Int, id);
      updateReq.input('status', sql.NVarChar(20), status);
      updateReq.input('isResolved', sql.Bit, status === 'Resolved' ? 1 : 0);
      updateReq.input('isClosed', sql.Bit, status === 'Closed' ? 1 : 0);

      const updateRes = await updateReq.query(`
        UPDATE dbo.Complaints
        SET 
          status = @status,
          updatedAt = SYSUTCDATETIME(),
          resolvedAt = CASE WHEN @isResolved = 1 THEN SYSUTCDATETIME() ELSE resolvedAt END,
          closedAt = CASE WHEN @isClosed = 1 THEN SYSUTCDATETIME() ELSE closedAt END
        OUTPUT 
          inserted.id,
          inserted.complaintCode,
          inserted.title,
          inserted.status,
          inserted.priority,
          inserted.resolvedAt,
          inserted.closedAt,
          inserted.updatedAt
        WHERE id = @id;
      `);

      // Write status history audit record
      const historyReq = new sql.Request(transaction);
      historyReq.input('complaintId', sql.Int, id);
      historyReq.input('oldStatus', sql.NVarChar(20), oldStatus);
      historyReq.input('newStatus', sql.NVarChar(20), status);
      historyReq.input('changedByUserId', sql.Int, adminId);
      historyReq.input('remarks', sql.NVarChar(500), remarks || `Status changed from ${oldStatus} to ${status}.`);

      await historyReq.query(`
        INSERT INTO dbo.ComplaintStatusHistory (
          complaintId, oldStatus, newStatus, changedByUserId, remarks, changedAt
        ) VALUES (
          @complaintId, @oldStatus, @newStatus, @changedByUserId, @remarks, SYSUTCDATETIME()
        );
      `);

      await transaction.commit();
      return updateRes.recordset[0];
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  /**
   * Updates complaint priority.
   */
  async updatePriority({ id, priority }) {
    const query = `
      UPDATE dbo.Complaints
      SET priority = @priority, updatedAt = SYSUTCDATETIME()
      OUTPUT 
        inserted.id,
        inserted.complaintCode,
        inserted.title,
        inserted.status,
        inserted.priority,
        inserted.updatedAt
      WHERE id = @id;
    `;
    const params = [
      { name: 'id', type: sql.Int, value: id },
      { name: 'priority', type: sql.NVarChar(20), value: priority }
    ];

    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  },

  /**
   * Assigns complaint to a department and records assignment in a transaction.
   */
  async assignDepartment({ complaintId, departmentId, assignedToUserId, assignedByUserId, assignmentNotes }) {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // Deactivate existing active assignments
      const deactivateReq = new sql.Request(transaction);
      deactivateReq.input('complaintId', sql.Int, complaintId);
      await deactivateReq.query('UPDATE dbo.ComplaintAssignments SET isActive = 0 WHERE complaintId = @complaintId');

      // Insert new assignment
      const assignReq = new sql.Request(transaction);
      assignReq.input('complaintId', sql.Int, complaintId);
      assignReq.input('departmentId', sql.Int, departmentId);
      assignReq.input('assignedToUserId', sql.Int, assignedToUserId || null);
      assignReq.input('assignedByUserId', sql.Int, assignedByUserId);
      assignReq.input('assignmentNotes', sql.NVarChar(500), assignmentNotes || null);

      const assignRes = await assignReq.query(`
        INSERT INTO dbo.ComplaintAssignments (
          complaintId, departmentId, assignedToUserId, assignedByUserId, assignmentNotes, assignedAt, isActive
        )
        OUTPUT 
          inserted.id,
          inserted.complaintId,
          inserted.departmentId,
          inserted.assignedToUserId,
          inserted.assignedByUserId,
          inserted.assignmentNotes,
          inserted.assignedAt,
          inserted.isActive
        VALUES (
          @complaintId, @departmentId, @assignedToUserId, @assignedByUserId, @assignmentNotes, SYSUTCDATETIME(), 1
        );
      `);

      // If complaint is currently Pending, automatically advance to 'In Progress'
      const statusCheckReq = new sql.Request(transaction);
      statusCheckReq.input('complaintId', sql.Int, complaintId);
      const statusRes = await statusCheckReq.query('SELECT status FROM dbo.Complaints WHERE id = @complaintId');

      if (statusRes.recordset.length > 0 && statusRes.recordset[0].status === 'Pending') {
        const advanceReq = new sql.Request(transaction);
        advanceReq.input('complaintId', sql.Int, complaintId);
        advanceReq.input('adminId', sql.Int, assignedByUserId);
        await advanceReq.query(`
          UPDATE dbo.Complaints SET status = 'In Progress', updatedAt = SYSUTCDATETIME() WHERE id = @complaintId;
          INSERT INTO dbo.ComplaintStatusHistory (complaintId, oldStatus, newStatus, changedByUserId, remarks, changedAt)
          VALUES (@complaintId, 'Pending', 'In Progress', @adminId, 'Assigned to department for resolution.', SYSUTCDATETIME());
        `);
      }

      // Fetch the full joined assignment record to return to caller
      const getActiveReq = new sql.Request(transaction);
      getActiveReq.input('complaintId', sql.Int, complaintId);
      const activeRes = await getActiveReq.query(`
        SELECT 
          a.id,
          a.complaintId,
          a.departmentId,
          d.name AS departmentName,
          a.assignedToUserId,
          u.fullName AS assignedToName,
          a.assignedByUserId,
          ab.fullName AS assignedByName,
          a.assignmentNotes,
          a.assignedAt,
          a.isActive
        FROM dbo.ComplaintAssignments a
        INNER JOIN dbo.Departments d ON a.departmentId = d.id
        LEFT JOIN dbo.Users u ON a.assignedToUserId = u.id
        INNER JOIN dbo.Users ab ON a.assignedByUserId = ab.id
        WHERE a.complaintId = @complaintId AND a.isActive = 1;
      `);

      await transaction.commit();
      return activeRes.recordset[0] || assignRes.recordset[0];
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  /**
   * Retrieves status history timeline for a complaint.
   */
  async getStatusHistory(complaintId) {
    const query = `
      SELECT 
        sh.id,
        sh.complaintId,
        sh.oldStatus,
        sh.newStatus,
        sh.oldStatus AS fromStatus,
        sh.newStatus AS toStatus,
        sh.changedByUserId,
        u.fullName AS changedByName,
        u.role AS changedByRole,
        sh.remarks,
        sh.changedAt,
        sh.changedAt AS createdAt
      FROM dbo.ComplaintStatusHistory sh
      INNER JOIN dbo.Users u ON sh.changedByUserId = u.id
      WHERE sh.complaintId = @complaintId
      ORDER BY sh.changedAt ASC;
    `;
    const params = [{ name: 'complaintId', type: sql.Int, value: complaintId }];
    const result = await executeQuery(query, params);
    return result.recordset;
  },

  /**
   * Retrieves comments on a complaint.
   */
  async getComments(complaintId, includeAdminOnly = false) {
    const params = [{ name: 'complaintId', type: sql.Int, value: complaintId }];
    let filter = '';

    if (!includeAdminOnly) {
      filter = 'AND cc.isAdminOnly = 0';
    }

    const query = `
      SELECT 
        cc.id,
        cc.complaintId,
        cc.userId,
        u.fullName AS authorName,
        u.role AS authorRole,
        cc.commentText,
        cc.isAdminOnly,
        cc.createdAt
      FROM dbo.ComplaintComments cc
      INNER JOIN dbo.Users u ON cc.userId = u.id
      WHERE cc.complaintId = @complaintId
      ${filter}
      ORDER BY cc.createdAt ASC;
    `;

    const result = await executeQuery(query, params);
    return result.recordset;
  },

  /**
   * Adds a new comment to a complaint.
   */
  async addComment({ complaintId, userId, commentText, isAdminOnly = false }) {
    const query = `
      INSERT INTO dbo.ComplaintComments (complaintId, userId, commentText, isAdminOnly, createdAt)
      OUTPUT 
        inserted.id,
        inserted.complaintId,
        inserted.userId,
        inserted.commentText,
        inserted.isAdminOnly,
        inserted.createdAt
      VALUES (@complaintId, @userId, @commentText, @isAdminOnly, SYSUTCDATETIME());
    `;

    const params = [
      { name: 'complaintId', type: sql.Int, value: complaintId },
      { name: 'userId', type: sql.Int, value: userId },
      { name: 'commentText', type: sql.NVarChar(sql.MAX), value: commentText },
      { name: 'isAdminOnly', type: sql.Bit, value: isAdminOnly ? 1 : 0 }
    ];

    const result = await executeQuery(query, params);
    const comment = result.recordset[0];

    // Fetch user author info for immediate return
    const userQuery = 'SELECT fullName, role FROM dbo.Users WHERE id = @userId';
    const userResult = await executeQuery(userQuery, [{ name: 'userId', type: sql.Int, value: userId }]);

    if (userResult.recordset.length > 0) {
      comment.authorName = userResult.recordset[0].fullName;
      comment.authorRole = userResult.recordset[0].role;
    }

    return comment;
  },

  /**
   * Retrieves active assignment details for a complaint.
   */
  async getActiveAssignment(complaintId) {
    const query = `
      SELECT 
        a.id,
        a.complaintId,
        a.departmentId,
        d.name AS departmentName,
        a.assignedToUserId,
        u.fullName AS assignedToName,
        a.assignedByUserId,
        ab.fullName AS assignedByName,
        a.assignmentNotes,
        a.assignedAt,
        a.isActive
      FROM dbo.ComplaintAssignments a
      INNER JOIN dbo.Departments d ON a.departmentId = d.id
      LEFT JOIN dbo.Users u ON a.assignedToUserId = u.id
      INNER JOIN dbo.Users ab ON a.assignedByUserId = ab.id
      WHERE a.complaintId = @complaintId AND a.isActive = 1;
    `;
    const params = [{ name: 'complaintId', type: sql.Int, value: complaintId }];
    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  },

  /**
   * Retrieves all assignment history for a complaint (active and previous).
   */
  async getAssignmentHistory(complaintId) {
    const query = `
      SELECT 
        a.id,
        a.complaintId,
        a.departmentId,
        d.name AS departmentName,
        a.assignedToUserId,
        u.fullName AS assignedToName,
        u.email AS assignedToEmail,
        a.assignedByUserId,
        ab.fullName AS assignedByName,
        a.assignmentNotes,
        a.assignedAt,
        a.isActive
      FROM dbo.ComplaintAssignments a
      INNER JOIN dbo.Departments d ON a.departmentId = d.id
      LEFT JOIN dbo.Users u ON a.assignedToUserId = u.id
      INNER JOIN dbo.Users ab ON a.assignedByUserId = ab.id
      WHERE a.complaintId = @complaintId
      ORDER BY a.assignedAt DESC;
    `;
    const params = [{ name: 'complaintId', type: sql.Int, value: complaintId }];
    const result = await executeQuery(query, params);
    return result.recordset;
  },

  /**
   * Updates an existing complaint's image reference.
   */
  async updateImage({ id, imageUrl, imageKey }) {
    const query = `
      UPDATE dbo.Complaints
      SET imageUrl = @imageUrl, imageKey = @imageKey, updatedAt = SYSUTCDATETIME()
      OUTPUT 
        inserted.id,
        inserted.complaintCode,
        inserted.imageUrl,
        inserted.imageKey,
        inserted.updatedAt
      WHERE id = @id;
    `;
    const params = [
      { name: 'id', type: sql.Int, value: id },
      { name: 'imageUrl', type: sql.NVarChar(500), value: imageUrl || null },
      { name: 'imageKey', type: sql.NVarChar(255), value: imageKey || null }
    ];

    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  },

  /**
   * Finds a complaint by its imageKey (used for authenticated image serving).
   */
  async findByImageKey(imageKey) {
    const query = `
      SELECT id, complaintCode, studentId, imageUrl, imageKey
      FROM dbo.Complaints
      WHERE imageKey = @imageKey;
    `;
    const params = [{ name: 'imageKey', type: sql.NVarChar(255), value: imageKey }];
    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  },

  /**
   * Retrieves summary statistics for admin dashboard.
   */
  async getSummaryStats() {
    const query = `
      SELECT 
        COUNT(*) AS totalComplaints,
        ISNULL(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) AS pendingCount,
        ISNULL(SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END), 0) AS inProgressCount,
        ISNULL(SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END), 0) AS resolvedCount,
        ISNULL(SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END), 0) AS closedCount,
        ISNULL(SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejectedCount,
        ISNULL(SUM(CASE WHEN priority = 'Critical' THEN 1 ELSE 0 END), 0) AS criticalCount
      FROM dbo.Complaints;
    `;
    const result = await executeQuery(query, []);
    return result.recordset[0] || {
      totalComplaints: 0,
      pendingCount: 0,
      inProgressCount: 0,
      resolvedCount: 0,
      closedCount: 0,
      rejectedCount: 0,
      criticalCount: 0
    };
  },

  /**
   * Retrieves summary statistics for student dashboard.
   */
  async getStudentStats(studentId) {
    const query = `
      SELECT 
        COUNT(*) AS totalComplaints,
        ISNULL(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) AS pendingCount,
        ISNULL(SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END), 0) AS inProgressCount,
        ISNULL(SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END), 0) AS resolvedCount,
        ISNULL(SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END), 0) AS closedCount,
        ISNULL(SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejectedCount
      FROM dbo.Complaints
      WHERE studentId = @studentId;
    `;
    const params = [{ name: 'studentId', type: sql.Int, value: studentId }];
    const result = await executeQuery(query, params);
    return result.recordset[0] || {
      totalComplaints: 0,
      pendingCount: 0,
      inProgressCount: 0,
      resolvedCount: 0,
      closedCount: 0,
      rejectedCount: 0
    };
  }
};

module.exports = complaintModel;
