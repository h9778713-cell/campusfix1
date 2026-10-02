/**
 * CampusFix — Authentication & Authorization Middleware
 * Enforces JWT verification, active user validation from database,
 * and role-based access control (RBAC).
 */

const authUtils = require('../utils/authUtils');
const userModel = require('../models/userModel');
const apiResponse = require('../utils/apiResponse');
const env = require('../config/env');

/**
 * Authentication Middleware
 * Validates JWT token from Bearer header or HttpOnly cookie.
 * Attaches verified database user object to req.user.
 */
async function authenticateToken(req, res, next) {
  try {
    let token = null;

    // 1. Check Authorization Bearer header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    // 2. Check HttpOnly cookie fallback
    if (!token && req.cookies && req.cookies[env.SESSION_COOKIE_NAME]) {
      token = req.cookies[env.SESSION_COOKIE_NAME];
    }

    // 3. Check query string token fallback (strictly for image/media tags on GET requests)
    if (!token && req.method === 'GET' && req.query && typeof req.query.token === 'string') {
      const urlStr = req.originalUrl || req.url || '';
      if (urlStr.includes('/images/') || urlStr.includes('/image')) {
        token = req.query.token.trim();
      }
    }

    if (!token) {
      return apiResponse.error(
        res,
        'Authentication required. No token provided.',
        'UNAUTHORIZED',
        401
      );
    }

    // 3. Verify cryptographic token signature and expiration
    let decoded;
    try {
      decoded = authUtils.verifyToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return apiResponse.error(
          res,
          'Your session has expired. Please log in again.',
          'TOKEN_EXPIRED',
          401
        );
      }
      return apiResponse.error(
        res,
        'Invalid or corrupted authentication token.',
        'INVALID_TOKEN',
        401
      );
    }

    // 4. Verify user exists in database and is active (prevents revoked/deleted user access)
    const user = await userModel.findById(decoded.id);
    if (!user) {
      return apiResponse.error(
        res,
        'User associated with this token no longer exists.',
        'USER_NOT_FOUND',
        401
      );
    }

    if (!user.isActive) {
      return apiResponse.error(
        res,
        'Your account has been deactivated. Please contact campus administration.',
        'ACCOUNT_DEACTIVATED',
        403
      );
    }

    // 5. Attach verified server-side user entity (role cannot be manipulated by client)
    req.user = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role, // Pure database role
      studentId: user.studentId,
      phone: user.phone
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Role-Based Access Control (RBAC) Middleware Factory
 * Restricts route access to specified system roles.
 *
 * @param  {...string} allowedRoles - e.g. 'admin', 'student'
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return apiResponse.error(
        res,
        'Authentication required.',
        'UNAUTHORIZED',
        401
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return apiResponse.error(
        res,
        `Access denied. Required role: [${allowedRoles.join(', ')}].`,
        'FORBIDDEN',
        403
      );
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles
};
