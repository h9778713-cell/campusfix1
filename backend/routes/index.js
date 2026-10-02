/**
 * CampusFix — Master API Route Index
 * Aggregates all modular route handlers under the /api namespace.
 */

const express = require('express');
const router = express.Router();

const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const complaintRoutes = require('./complaintRoutes');
const adminRoutes = require('./adminRoutes');
const metadataRoutes = require('./metadataRoutes');
const systemController = require('../controllers/systemController');

// Mount Sub-routers
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/complaints', complaintRoutes);
router.use('/admin', adminRoutes);
router.use('/', metadataRoutes);

// System query diagnostic endpoint
router.get('/system/stats', systemController.getSystemStats);

module.exports = router;
