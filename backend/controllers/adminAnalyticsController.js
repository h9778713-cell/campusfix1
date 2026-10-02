/**
 * CampusFix — Admin Analytics Controller
 * Handles administrative analytics queries, metric overviews, activity feeds,
 * and department workload distributions.
 */

const analyticsModel = require('../models/analyticsModel');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const adminAnalyticsController = {
  /**
   * View Full Analytics Dashboard Suite (Admin Only)
   * GET /api/admin/analytics
   */
  async getFullAnalytics(req, res, next) {
    try {
      const data = await analyticsModel.getFullAnalyticsSuite();
      return apiResponse.success(res, data, 'Admin analytics suite retrieved.');
    } catch (err) {
      logger.error('Failed to retrieve full analytics suite:', err);
      next(err);
    }
  },

  /**
   * View High-Level Overview Metrics (Admin Only)
   * GET /api/admin/analytics/overview
   */
  async getOverview(req, res, next) {
    try {
      const overview = await analyticsModel.getOverviewStats();
      return apiResponse.success(res, overview, 'Analytics overview retrieved.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Status & Priority Distributions (Admin Only)
   * GET /api/admin/analytics/distributions
   */
  async getDistributions(req, res, next) {
    try {
      const [byStatus, byPriority] = await Promise.all([
        analyticsModel.getStatusDistribution(),
        analyticsModel.getPriorityDistribution()
      ]);
      return apiResponse.success(res, { byStatus, byPriority }, 'Distributions retrieved.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Category Distribution (Admin Only)
   * GET /api/admin/analytics/categories
   */
  async getCategories(req, res, next) {
    try {
      const categories = await analyticsModel.getCategoryDistribution();
      return apiResponse.success(res, categories, 'Category analytics retrieved.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Location / Building Distribution (Admin Only)
   * GET /api/admin/analytics/locations
   */
  async getLocations(req, res, next) {
    try {
      const limit = parseInt(req.query.limit, 10) || 8;
      const locations = await analyticsModel.getLocationDistribution(limit);
      return apiResponse.success(res, locations, 'Location analytics retrieved.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Historical Daily Trends (Admin Only)
   * GET /api/admin/analytics/trends
   */
  async getTrends(req, res, next) {
    try {
      const days = parseInt(req.query.days, 10) || 14;
      const trends = await analyticsModel.getTrends(days);
      return apiResponse.success(res, trends, 'Grievance trends retrieved.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Recent Activity Feed (Admin Only)
   * GET /api/admin/analytics/activity
   */
  async getRecentActivity(req, res, next) {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const activity = await analyticsModel.getRecentActivity(limit);
      return apiResponse.success(res, activity, 'Recent activity stream retrieved.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * View Department Workload & Backlog (Admin Only)
   * GET /api/admin/analytics/workload
   */
  async getWorkload(req, res, next) {
    try {
      const workload = await analyticsModel.getDepartmentWorkload();
      return apiResponse.success(res, workload, 'Department workload analytics retrieved.');
    } catch (err) {
      next(err);
    }
  }
};

module.exports = adminAnalyticsController;
