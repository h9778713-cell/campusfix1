/**
 * CampusFix — Metadata Controller
 * Serves active campus categories and departments for forms and filters.
 */

const categoryModel = require('../models/categoryModel');
const departmentModel = require('../models/departmentModel');
const apiResponse = require('../utils/apiResponse');

const metadataController = {
  /**
   * List All Active Categories
   * GET /api/categories
   */
  async getCategories(req, res, next) {
    try {
      const categories = await categoryModel.getAllActive();
      return apiResponse.success(res, categories, 'Categories retrieved.');
    } catch (err) {
      next(err);
    }
  },

  /**
   * List All Active Departments
   * GET /api/departments
   */
  async getDepartments(req, res, next) {
    try {
      const departments = await departmentModel.getAllActive();
      return apiResponse.success(res, departments, 'Departments retrieved.');
    } catch (err) {
      next(err);
    }
  }
};

module.exports = metadataController;
