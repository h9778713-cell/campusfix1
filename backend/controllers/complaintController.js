/**
 * CampusFix — Complaint Controller (Student & Shared Operations)
 * Handles complaint creation, personal complaint listing, details retrieval,
 * IDOR defense, and threaded comments.
 */

const validators = require('../utils/validators');
const complaintModel = require('../models/complaintModel');
const categoryModel = require('../models/categoryModel');
const storageService = require('../services/storageService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const complaintController = {
  /**
   * Submit New Complaint
   * POST /api/complaints
   */
  async createComplaint(req, res, next) {
    try {
      // 1. Validate payload fields
      const validation = validators.validateComplaint(req.body);
      if (!validation.isValid) {
        return apiResponse.error(
          res,
          'Validation failed. Please correct the form fields.',
          'VALIDATION_ERROR',
          400,
          validation.errors
        );
      }

      const { title, description, categoryId, building, roomNumber, priority } = validation.sanitized;
      let finalImageUrl = validation.sanitized.imageUrl;
      let finalImageKey = validation.sanitized.imageKey;

      // If a validated image file was uploaded via multipart/form-data, persist it
      if (req.file) {
        const saved = await storageService.saveFile(req.file);
        finalImageKey = saved.key;
        finalImageUrl = `/api/complaints/images/${saved.key}`;
      }

      // 2. Validate category exists and is active
      const category = await categoryModel.findById(categoryId);
      if (!category || !category.isActive) {
        return apiResponse.error(
          res,
          'The selected category is invalid or inactive.',
          'INVALID_CATEGORY',
          400
        );
      }

      // 3. User ID strictly taken from verified server-side session (Anti-Privilege Escalation)
      const studentId = req.user.id;

      // 4. Create complaint in database
      const newComplaint = await complaintModel.create({
        title,
        description,
        categoryId,
        studentId,
        building,
        roomNumber,
        priority,
        imageUrl: finalImageUrl,
        imageKey: finalImageKey
      });

      logger.info(`Complaint submitted: ${newComplaint.complaintCode} by Student ID ${studentId}`);

      return apiResponse.success(
        res,
        newComplaint,
        'Complaint submitted successfully. Your grievance code is ' + newComplaint.complaintCode,
        201
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Student's Own Complaints
   * GET /api/complaints/my
   */
  async getMyComplaints(req, res, next) {
    try {
      const studentId = req.user.id;
      const { status, priority, categoryId, search, page = 1, limit = 10 } = req.query;

      const parsedPage = Math.max(1, parseInt(page, 10) || 1);
      const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
      const parsedCategoryId = categoryId ? parseInt(categoryId, 10) : null;

      const safeStatus = status && validators.VALID_STATUSES.includes(status) ? status : null;
      const safePriority = priority && validators.VALID_PRIORITIES.includes(priority) ? priority : null;

      const result = await complaintModel.findStudentComplaints({
        studentId,
        status: safeStatus,
        priority: safePriority,
        categoryId: parsedCategoryId,
        search: search ? String(search).trim().slice(0, 100) : null,
        page: parsedPage,
        limit: parsedLimit
      });

      return apiResponse.success(res, result, 'Student complaints retrieved successfully.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Student's Personal Stats
   * GET /api/complaints/my/stats
   */
  async getMyStats(req, res, next) {
    try {
      const studentId = req.user.id;
      const stats = await complaintModel.getStudentStats(studentId);
      return apiResponse.success(res, stats, 'Student stats retrieved successfully.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Complaint Details (Enforces IDOR Protection)
   * GET /api/complaints/:id
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

      // IDOR Protection: Student can ONLY view their own complaints
      if (req.user.role !== 'admin' && complaint.studentId !== req.user.id) {
        return apiResponse.error(
          res,
          'You do not have permission to view this complaint.',
          'FORBIDDEN',
          403
        );
      }

      const isAdmin = req.user.role === 'admin';

      // Load status timeline, comments, and assignment
      const [history, comments, assignment] = await Promise.all([
        complaintModel.getStatusHistory(complaintId),
        complaintModel.getComments(complaintId, isAdmin),
        complaintModel.getActiveAssignment(complaintId)
      ]);

      const responseData = {
        ...complaint,
        history,
        comments,
        assignment
      };

      return apiResponse.success(res, responseData, 'Complaint details retrieved.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * Post Comment on Complaint
   * POST /api/complaints/:id/comments
   */
  async addComment(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);
      if (isNaN(complaintId) || complaintId <= 0) {
        return apiResponse.error(res, 'Invalid complaint ID.', 'INVALID_ID', 400);
      }

      const complaint = await complaintModel.findById(complaintId);
      if (!complaint) {
        return apiResponse.error(res, 'Complaint not found.', 'NOT_FOUND', 404);
      }

      // Ownership Check: Student can only comment on their own complaint
      if (req.user.role !== 'admin' && complaint.studentId !== req.user.id) {
        return apiResponse.error(
          res,
          'You do not have permission to comment on this complaint.',
          'FORBIDDEN',
          403
        );
      }

      const validation = validators.validateComment(req.body);
      if (!validation.isValid) {
        return apiResponse.error(
          res,
          'Comment validation failed.',
          'VALIDATION_ERROR',
          400,
          validation.errors
        );
      }

      // Only admins can post admin-only internal notes
      const isAdminOnly = req.user.role === 'admin' ? validation.sanitized.isAdminOnly : false;

      const newComment = await complaintModel.addComment({
        complaintId,
        userId: req.user.id,
        commentText: validation.sanitized.commentText,
        isAdminOnly
      });

      logger.info(`Comment added on complaint ${complaintId} by ${req.user.email}`);

      return apiResponse.success(res, newComment, 'Comment posted successfully.', 201);
    } catch (err) {
      next(err);
    }
  },

  /**
   * Get Comments on Complaint
   * GET /api/complaints/:id/comments
   */
  async getComments(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);
      if (isNaN(complaintId) || complaintId <= 0) {
        return apiResponse.error(res, 'Invalid complaint ID.', 'INVALID_ID', 400);
      }

      const complaint = await complaintModel.findById(complaintId);
      if (!complaint) {
        return apiResponse.error(res, 'Complaint not found.', 'NOT_FOUND', 404);
      }

      if (req.user.role !== 'admin' && complaint.studentId !== req.user.id) {
        return apiResponse.error(
          res,
          'You do not have permission to view comments on this complaint.',
          'FORBIDDEN',
          403
        );
      }

      const isAdmin = req.user.role === 'admin';
      const comments = await complaintModel.getComments(complaintId, isAdmin);

      return apiResponse.success(res, comments, 'Comments retrieved successfully.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * Get Status History Timeline
   * GET /api/complaints/:id/history
   */
  async getStatusHistory(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);
      if (isNaN(complaintId) || complaintId <= 0) {
        return apiResponse.error(res, 'Invalid complaint ID.', 'INVALID_ID', 400);
      }

      const complaint = await complaintModel.findById(complaintId);
      if (!complaint) {
        return apiResponse.error(res, 'Complaint not found.', 'NOT_FOUND', 404);
      }

      if (req.user.role !== 'admin' && complaint.studentId !== req.user.id) {
        return apiResponse.error(
          res,
          'You do not have permission to view history for this complaint.',
          'FORBIDDEN',
          403
        );
      }

      const history = await complaintModel.getStatusHistory(complaintId);
      return apiResponse.success(res, history, 'Status history timeline retrieved.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * Upload / Replace Complaint Image
   * POST /api/complaints/:id/image
   */
  async uploadComplaintImage(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);
      if (isNaN(complaintId) || complaintId <= 0) {
        return apiResponse.error(res, 'Invalid complaint ID.', 'INVALID_ID', 400);
      }

      const complaint = await complaintModel.findById(complaintId);
      if (!complaint) {
        return apiResponse.error(res, 'Complaint not found.', 'NOT_FOUND', 404);
      }

      // IDOR Authorization: Only complaint owner or admin can upload
      if (req.user.role !== 'admin' && complaint.studentId !== req.user.id) {
        return apiResponse.error(
          res,
          'You do not have permission to upload an image for this complaint.',
          'FORBIDDEN',
          403
        );
      }

      if (!req.file) {
        return apiResponse.error(res, 'No image file was provided.', 'NO_FILE_PROVIDED', 400);
      }

      // Save new file to storage
      const saved = await storageService.saveFile(req.file);
      const imageUrl = `/api/complaints/images/${saved.key}`;
      const imageKey = saved.key;

      // Clean up previous image if one was present
      if (complaint.imageKey) {
        await storageService.deleteFile(complaint.imageKey);
      }

      const updated = await complaintModel.updateImage({
        id: complaintId,
        imageUrl,
        imageKey
      });

      logger.info(`Image uploaded for complaint ${complaintId} by user ${req.user.id} (${imageKey})`);

      return apiResponse.success(
        res,
        {
          id: updated.id,
          complaintCode: updated.complaintCode,
          imageUrl: updated.imageUrl,
          imageKey: updated.imageKey,
          size: saved.size,
          mimeType: saved.mimeType
        },
        'Complaint image uploaded successfully.',
        200
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Complaint Image by Complaint ID
   * GET /api/complaints/:id/image
   */
  async getComplaintImage(req, res, next) {
    try {
      const complaintId = parseInt(req.params.id, 10);
      if (isNaN(complaintId) || complaintId <= 0) {
        return apiResponse.error(res, 'Invalid complaint ID.', 'INVALID_ID', 400);
      }

      const complaint = await complaintModel.findById(complaintId);
      if (!complaint) {
        return apiResponse.error(res, 'Complaint not found.', 'NOT_FOUND', 404);
      }

      // IDOR Authorization: Only owner or admin can view
      if (req.user.role !== 'admin' && complaint.studentId !== req.user.id) {
        return apiResponse.error(
          res,
          'You do not have permission to view images for this complaint.',
          'FORBIDDEN',
          403
        );
      }

      if (!complaint.imageKey) {
        return apiResponse.error(res, 'This complaint does not have an attached image.', 'IMAGE_NOT_FOUND', 404);
      }

      const fileData = await storageService.getFile(complaint.imageKey);
      if (!fileData) {
        return apiResponse.error(res, 'Image file not found on storage.', 'IMAGE_NOT_FOUND', 404);
      }

      // Strict security headers for served image
      res.setHeader('Content-Type', fileData.mimeType);
      res.setHeader('Content-Length', fileData.size);
      res.setHeader('Content-Security-Policy', "default-src 'none'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=3600');

      return res.send(fileData.buffer);
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Complaint Image by Storage Key
   * GET /api/complaints/images/:key
   */
  async getImageByKey(req, res, next) {
    try {
      const key = req.params.key;
      if (!key || typeof key !== 'string') {
        return apiResponse.error(res, 'Invalid image key.', 'INVALID_KEY', 400);
      }

      // Defense against path traversal in key
      if (key.includes('..') || key.includes('/') || key.includes('\\')) {
        return apiResponse.error(res, 'Invalid image key format.', 'INVALID_KEY', 400);
      }

      const complaint = await complaintModel.findByImageKey(key);
      if (!complaint) {
        return apiResponse.error(res, 'Image not found.', 'IMAGE_NOT_FOUND', 404);
      }

      // IDOR Authorization: Only owner or admin can view
      if (req.user.role !== 'admin' && complaint.studentId !== req.user.id) {
        return apiResponse.error(
          res,
          'You do not have permission to view this image.',
          'FORBIDDEN',
          403
        );
      }

      const fileData = await storageService.getFile(key);
      if (!fileData) {
        return apiResponse.error(res, 'Image file not found on storage.', 'IMAGE_NOT_FOUND', 404);
      }

      // Strict security headers for served image
      res.setHeader('Content-Type', fileData.mimeType);
      res.setHeader('Content-Length', fileData.size);
      res.setHeader('Content-Security-Policy', "default-src 'none'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=3600');

      return res.send(fileData.buffer);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = complaintController;
