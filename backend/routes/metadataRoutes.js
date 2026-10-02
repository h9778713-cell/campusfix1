/**
 * CampusFix — Public/Shared Metadata Routes
 * Provides active categories and facility departments.
 */

const express = require('express');
const router = express.Router();
const metadataController = require('../controllers/metadataController');

router.get('/categories', metadataController.getCategories);
router.get('/departments', metadataController.getDepartments);

module.exports = router;
