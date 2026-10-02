/**
 * CampusFix — Authentication Routes
 * Public and role-protected authentication endpoints.
 */

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { authLimiter, registerLimiter } = require('../middleware/security');
const apiResponse = require('../utils/apiResponse');

// 1. Public Authentication Endpoints
router.post('/register', registerLimiter, authController.register);
router.post('/login', authLimiter, authController.login);

// 2. Protected Session Endpoints
router.get('/me', authenticateToken, authController.getMe);
router.post('/logout', authenticateToken, authController.logout);

// 3. Role-Protected Test Endpoints for Verification
router.get('/student-only', authenticateToken, authorizeRoles('student'), (req, res) => {
  return apiResponse.success(
    res,
    { student: req.user },
    'Access granted to student-only endpoint.'
  );
});

router.get('/admin-only', authenticateToken, authorizeRoles('admin'), (req, res) => {
  return apiResponse.success(
    res,
    { admin: req.user },
    'Access granted to admin-only endpoint.'
  );
});

module.exports = router;
