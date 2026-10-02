/**
 * CampusFix — Centralized Error Handling Middleware
 * Catches all unhandled route errors and returns safe, standardized JSON envelopes.
 */

const env = require('../config/env');
const logger = require('../utils/logger');
const apiResponse = require('../utils/apiResponse');

/**
 * 404 Not Found Handler for undefined routes
 */
function notFoundHandler(req, res, next) {
  return apiResponse.error(
    res,
    `Resource not found: ${req.method} ${req.originalUrl}`,
    'NOT_FOUND',
    404
  );
}

/**
 * Centralized Error Handler Middleware
 */
function errorHandler(err, req, res, next) {
  // Log error with stack trace internally on the server
  logger.error(`[Unhandled Request Error] ${req.method} ${req.originalUrl}:`, err);

  let statusCode = err.statusCode || err.status || 500;
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  let clientMessage = err.message || 'An unexpected internal error occurred.';

  // Handle specific known error types
  if (err.name === 'SyntaxError' && err.status === 400 && 'body' in err) {
    errorCode = 'INVALID_JSON_PAYLOAD';
    clientMessage = 'Malformed JSON body in request payload.';
  } else if (err.code === 'LIMIT_FILE_SIZE' || err.type === 'entity.too.large') {
    statusCode = 413;
    errorCode = 'FILE_TOO_LARGE';
    clientMessage = 'The uploaded file or request payload exceeds the allowed size limit (5 MB).';
  } else if (err.message && err.message.includes('Blocked by CORS')) {
    errorCode = 'CORS_VIOLATION';
    clientMessage = 'Request origin is not allowed by CORS policy.';
  } else if (err.name === 'MSSQLError' || (err.message && err.message.toLowerCase().includes('sql'))) {
    errorCode = 'DATABASE_ERROR';
    clientMessage = 'A database error occurred while processing the request.';
  } else if (statusCode === 500) {
    // Hide all raw internal error details in 500 responses
    clientMessage = 'An unexpected internal error occurred. Please try again later.';
  }

  // Never leak stack traces or internal paths to clients
  return apiResponse.error(res, clientMessage, errorCode, statusCode);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
