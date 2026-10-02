/**
 * CampusFix — Complaint Routes
 * Endpoints for complaint creation, personal listing, details view,
 * threaded comments, and history tracking.
 */

const express = require('express');
const router = express.Router();

const complaintController = require('../controllers/complaintController');
const uploadMiddleware = require('../middleware/upload');
const { authenticateToken } = require('../middleware/auth');

// All complaint routes require an authenticated user
router.use(authenticateToken);

// 1. Submit New Complaint (supports JSON or multipart with optional image)
router.post('/', uploadMiddleware.handleOptionalUpload, complaintController.createComplaint);

// 2. View Student's Own Complaints
router.get('/my', complaintController.getMyComplaints);
router.get('/my/stats', complaintController.getMyStats);

// 3. View Complaint Image by Storage Key (Must precede /:id)
router.get('/images/:key', complaintController.getImageByKey);

// 4. View Complaint Details (IDOR protected: owner or admin)
router.get('/:id', complaintController.getComplaintDetails);

// 5. Upload / Replace Image on Existing Complaint
router.post('/:id/image', uploadMiddleware.requireUpload, complaintController.uploadComplaintImage);

// 6. View Complaint Image by Complaint ID
router.get('/:id/image', complaintController.getComplaintImage);

// 7. Threaded Comments on Complaint
router.post('/:id/comments', complaintController.addComment);
router.get('/:id/comments', complaintController.getComments);

// 8. Status Audit Timeline
router.get('/:id/history', complaintController.getStatusHistory);

module.exports = router;
