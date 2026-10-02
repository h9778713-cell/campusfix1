/**
 * CampusFix — Application Logger
 * Provides structured, timestamped console logging with log-level gating.
 */

const env = require('../config/env');

const logger = {
  info(message, meta = '') {
    console.log(`[INFO]  [${new Date().toISOString()}] ${message}`, meta ? meta : '');
  },

  warn(message, meta = '') {
    console.warn(`[WARN]  [${new Date().toISOString()}] ${message}`, meta ? meta : '');
  },

  error(message, error = null) {
    console.error(`[ERROR] [${new Date().toISOString()}] ${message}`, error ? (error.stack || error.message || error) : '');
  },

  debug(message, meta = '') {
    if (!env.isProduction()) {
      console.log(`[DEBUG] [${new Date().toISOString()}] ${message}`, meta ? meta : '');
    }
  }
};

module.exports = logger;
