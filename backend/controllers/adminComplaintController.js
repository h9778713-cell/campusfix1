/**
 * CampusFix — Admin Complaint Controller
 * Handles administrative complaint triage, status progression, priority changes,
 * and departmental assignments.
 */

const validators = require('../utils/validators');
const complaintModel = require('../models/complaintModel');
const departmentModel = require('../models/departmentModel');
const userModel = require('../models/userModel');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const adminComplaintController = {
  /**
   * View All Campus Complaints (Admin Only)
   * GET /api/admin/complaints
   */
  async getAllComplaints(req, res, next) {
    try {
      const { 
        status, 
        priority, 
        categoryId, 
        departmentId, 
        building, 
        search, 
        sortBy = 'createdAt', 
        sortOrder = 'DESC', 
        page = 1, 
        limit = 10 
      } = req.query;

      const parsedPage = Math.max(1, parseInt(page, 10) || 1);
      const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
      const parsedCategoryId = categoryId ? parseInt(categoryId, 10) : null;
      const parsedDepartmentId = departmentId ? parseInt(departmentId, 10) : null;

      const safeStatus = status && validators.VALID_STATUSES.includes(status) ? status : null;
      const safePriority = priority && validators.VALID_PRIORITIES.includes(priority) ? priority : null;

      const result = await complaintModel.findAllComplaints({
        status: safeStatus,
        priority: safePriority,
        categoryId: parsedCategoryId,
        departmentId: parsedDepartmentId,
        building: building ? String(building).trim().slice(0, 100) : null,
        search: search ? String(search).trim().slice(0, 100) : null,
        sortBy,
        sortOrder,
        page: parsedPage,
        limit: parsedLimit
      });

      return apiResponse.success(res, result, 'All campus complaints retrieved.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Admin Complaint Details
   * GET /api/admin/complaints/:id
   */
  async getComplaintDetails(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);
      if (isNaN(complaintId) || complaintId <= 0) {
        return apiResponse.error(res, 'Invalid complaint ID.', 'INVALID_ID', 400);
      }

      const complaint = await complaintModel.findById(complaintId);
      if (!complaint) {
        return apiResponse.error(res, 'Complaint not found.', 'NOT_FOUND', 404);
      }

      const [history, comments, assignment] = await Promise.all([
        complaintModel.getStatusHistory(complaintId),
        complaintModel.getComments(complaintId, true), // true = includes admin-only notes
        complaintModel.getActiveAssignment(complaintId)
      ]);

      return apiResponse.success(
        res,
        {
          ...complaint,
          history,
          comments,
          assignment
        },
        'Admin complaint details retrieved.'
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * Update Complaint Status (Admin Only)
   * PATCH /api/admin/complaints/:id/status
   */
  async updateStatus(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);
      if (isNaN(complaintId) || complaintId <= 0) {
        return apiResponse.error(res, 'Invalid complaint ID.', 'INVALID_ID', 400);
      }

      const validation = validators.validateStatusUpdate(req.body);
      if (!validation.isValid) {
        return apiResponse.error(
          res,
          'Invalid status update request.',
          'VALIDATION_ERROR',
          400,
          validation.errors
        );
      }

      const { status, remarks } = validation.sanitized;
      const adminId = req.user.id;

      const complaint = await complaintModel.findById(complaintId);
      if (!complaint) {
        return apiResponse.error(res, 'Complaint not found.', 'NOT_FOUND', 404);
      }

      if (complaint.status === status) {
        return apiResponse.error(
          res,
          `Complaint is already marked as "${status}".`,
          'STATUS_UNCHANGED',
          400
        );
      }

      const updated = await complaintModel.updateStatus({
        id: complaintId,
        status,
        adminId,
        remarks
      });

      logger.info(`Complaint ${complaintId} status changed to ${status} by Admin ID ${adminId}`);

      return apiResponse.success(
        res,
        updated,
        `Complaint status successfully updated to "${status}".`
      );
    } catch (err) {
      if (err.code === 'STATUS_UNCHANGED') {
        return apiResponse.error(res, err.message, 'STATUS_UNCHANGED', 400);
      }
      next(err);
    }
  },

  /**
   * Update Complaint Priority (Admin Only)
   * PATCH /api/admin/complaints/:id/priority
   */
  async updatePriority(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);
      if (isNaN(complaintId) || complaintId <= 0) {
        return apiResponse.error(res, 'Invalid complaint ID.', 'INVALID_ID', 400);
      }

      const validation = validators.validatePriorityUpdate(req.body);
      if (!validation.isValid) {
        return apiResponse.error(
          res,
          'Invalid priority update request.',
          'VALIDATION_ERROR',
          400,
          validation.errors
        );
      }

      const { priority } = validation.sanitized;

      const updated = await complaintModel.updatePriority({
        id: complaintId,
        priority
      });

      if (!updated) {
        return apiResponse.error(res, 'Complaint not found.', 'NOT_FOUND', 404);
      }

      logger.info(`Complaint ${complaintId} priority changed to ${priority} by Admin ID ${req.user.id}`);

      return apiResponse.success(
        res,
        updated,
        `Complaint priority updated to "${priority}".`
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * Assign Complaint to Department / Staff (Admin Only)
   * POST /api/admin/complaints/:id/assign
   */
  async assignComplaint(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);
      if (isNaN(complaintId) || complaintId <= 0) {
        return apiResponse.error(res, 'Invalid complaint ID.', 'INVALID_ID', 400);
      }

      const complaint = await complaintModel.findById(complaintId);
      if (!complaint) {
        return apiResponse.error(res, 'Complaint not found.', 'NOT_FOUND', 404);
      }

      const validation = validators.validateAssignment(req.body);
      if (!validation.isValid) {
        return apiResponse.error(
          res,
          'Invalid assignment details.',
          'VALIDATION_ERROR',
          400,
          validation.errors
        );
      }

      const { departmentId, assignedToUserId, assignmentNotes } = validation.sanitized;

      // Verify department exists
      const dept = await departmentModel.findById(departmentId);
      if (!dept || !dept.isActive) {
        return apiResponse.error(res, 'Specified department does not exist or is inactive.', 'INVALID_DEPARTMENT', 400);
      }

      // If assignedToUserId provided, verify target user exists and is an admin
      if (assignedToUserId) {
        const targetUser = await userModel.findById(assignedToUserId);
        if (!targetUser) {
          return apiResponse.error(res, 'Specified staff member does not exist.', 'INVALID_STAFF_USER', 400);
        }
        if (targetUser.role !== 'admin') {
          return apiResponse.error(
            res,
            'Cannot assign complaints to a student account. Assignee must be an administrator or staff member.',
            'INVALID_ASSIGNEE',
            400
          );
        }
      }

      const assignment = await complaintModel.assignDepartment({
        complaintId,
        departmentId,
        assignedToUserId,
        assignedByUserId: req.user.id,
        assignmentNotes
      });

      logger.info(`Complaint ${complaintId} assigned to department ${departmentId} by Admin ID ${req.user.id}`);

      return apiResponse.success(
        res,
        assignment,
        `Complaint assigned to ${dept.name}.`,
        200
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Complaint Assignment History (Admin Only)
   * GET /api/admin/complaints/:id/assignments
   */
  async getAssignmentHistory(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);
      if (isNaN(complaintId) || complaintId <= 0) {
        return apiResponse.error(res, 'Invalid complaint ID.', 'INVALID_ID', 400);
      }

      const complaint = await complaintModel.findById(complaintId);
      if (!complaint) {
        return apiResponse.error(res, 'Complaint not found.', 'NOT_FOUND', 404);
      }

      const history = await complaintModel.getAssignmentHistory(complaintId);
      return apiResponse.success(res, history, 'Complaint assignment history retrieved.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Complaint Statistics (Admin Only)
   * GET /api/admin/stats
   */
  async getStats(req, res, next) {
    try {
      const stats = await complaintModel.getSummaryStats();
      return apiResponse.success(res, stats, 'Admin summary statistics retrieved.');
    } catch (err) {
      next(err);
    }
  }
};

module.exports = adminComplaintController;
