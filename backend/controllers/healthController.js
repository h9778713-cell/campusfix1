/**
 * CampusFix — Health & Diagnostics Controller
 * Provides liveness and database connectivity verification endpoints.
 */

const { checkDatabaseHealth } = require('../config/db');
const env = require('../config/env');
const apiResponse = require('../utils/apiResponse');

const healthController = {
  /**
   * Basic Server Liveness Check
   * GET /api/health
   */
  getHealth(req, res) {
    const memoryUsage = process.memoryUsage();
    
    const healthData = {
      status: 'healthy',
      service: 'CampusFix API',
      environment: env.NODE_ENV,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      memory: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024)
      }
    };

    return apiResponse.success(res, healthData, 'Server is operational');
  },

  /**
   * Database Connectivity Verification Check
   * GET /api/health/db
   */
  async getDatabaseHealth(req, res) {
    const dbStatus = await checkDatabaseHealth();

    const responsePayload = {
      status: dbStatus.healthy ? 'connected' : 'disconnected',
      database: env.DB_NAME,
      latencyMs: dbStatus.latencyMs,
      timestamp: dbStatus.timestamp || new Date().toISOString()
    };

    if (dbStatus.healthy) {
      return apiResponse.success(
        res,
        responsePayload,
        'Database connection active and responsive'
      );
    } else {
      responsePayload.error = dbStatus.error;
      return apiResponse.error(
        res,
        'Database connectivity test failed',
        'DATABASE_UNAVAILABLE',
        503,
        responsePayload
      );
    }
  }
};

module.exports = healthController;
