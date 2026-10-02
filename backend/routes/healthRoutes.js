/**
 * CampusFix — Health & Status Routes
 * Defines liveness and readiness diagnostic endpoints.
 */

const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

// GET /api/health - Server liveness
router.get('/', healthController.getHealth);

// GET /api/health/db - Database readiness
router.get('/db', healthController.getDatabaseHealth);

module.exports = router;
