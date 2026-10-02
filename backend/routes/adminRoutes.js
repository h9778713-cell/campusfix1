/**
 * CampusFix — Administrative Management Routes
 * Protected endpoints restricted strictly to users with role='admin'.
 */

const express = require('express');
const router = express.Router();

const adminComplaintController = require('../controllers/adminComplaintController');
const adminAnalyticsController = require('../controllers/adminAnalyticsController');
const complaintController = require('../controllers/complaintController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Strict Gate: Admin Role Required for ALL routes in this module
router.use(authenticateToken);
router.use(authorizeRoles('admin'));

// 1. Complaint Administration
router.get('/complaints', adminComplaintController.getAllComplaints);
router.get('/complaints/:id', adminComplaintController.getComplaintDetails);
router.patch('/complaints/:id/status', adminComplaintController.updateStatus);
router.patch('/complaints/:id/priority', adminComplaintController.updatePriority);
router.post('/complaints/:id/assign', adminComplaintController.assignComplaint);
router.get('/complaints/:id/assignments', adminComplaintController.getAssignmentHistory);
router.get('/complaints/:id/history', complaintController.getStatusHistory);
router.get('/stats', adminComplaintController.getStats);

// 2. Comprehensive Admin Analytics Suite
router.get('/analytics', adminAnalyticsController.getFullAnalytics);
router.get('/analytics/overview', adminAnalyticsController.getOverview);
router.get('/analytics/distributions', adminAnalyticsController.getDistributions);
router.get('/analytics/categories', adminAnalyticsController.getCategories);
router.get('/analytics/locations', adminAnalyticsController.getLocations);
router.get('/analytics/trends', adminAnalyticsController.getTrends);
router.get('/analytics/activity', adminAnalyticsController.getRecentActivity);
router.get('/analytics/workload', adminAnalyticsController.getWorkload);

module.exports = router;
