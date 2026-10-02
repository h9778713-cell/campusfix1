/**
 * CampusFix — Secure Upload Middleware
 * Utilizes Multer memory storage and deep magic-byte inspection
 * to ensure incoming complaint attachments are strictly valid images.
 */

const multer = require('multer');
const env = require('../config/env');
const fileValidator = require('../utils/fileValidator');
const apiResponse = require('../utils/apiResponse');

const MAX_BYTES = env.MAX_FILE_SIZE_MB * 1024 * 1024;

// Configure Multer to buffer incoming file in RAM for inspection before saving to disk/cloud
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_BYTES,
    files: 1
  }
});

const uploadMiddleware = {
  /**
   * Optional file upload middleware (used on complaint submission).
   * Supports both multipart/form-data with optional file and application/json.
   */
  handleOptionalUpload(req, res, next) {
    const contentType = req.headers['content-type'] || '';

    // If request is not multipart, proceed directly to JSON body handling
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      return next();
    }

    upload.single('image')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return apiResponse.error(
            res,
            `File size exceeds the allowed limit of ${env.MAX_FILE_SIZE_MB} MB.`,
            'FILE_TOO_LARGE',
            400
          );
        }
        return apiResponse.error(res, 'File upload failed: ' + err.message, 'UPLOAD_ERROR', 400);
      }

      // If a file was attached in multipart form, validate it
      if (req.file) {
        const validation = fileValidator.validateImage(req.file, MAX_BYTES);
        if (!validation.isValid) {
          return apiResponse.error(res, validation.error, validation.code, 400);
        }
        req.file.detected = validation.detected;
      }

      next();
    });
  },

  /**
   * Required file upload middleware (used on POST /api/complaints/:id/image).
   * Rejects requests where no image is provided.
   */
  requireUpload(req, res, next) {
    upload.single('image')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return apiResponse.error(
            res,
            `File size exceeds the allowed limit of ${env.MAX_FILE_SIZE_MB} MB.`,
            'FILE_TOO_LARGE',
            400
          );
        }
        return apiResponse.error(res, 'File upload failed: ' + err.message, 'UPLOAD_ERROR', 400);
      }

      if (!req.file) {
        return apiResponse.error(res, 'Please provide an image file to upload.', 'NO_FILE_PROVIDED', 400);
      }

      const validation = fileValidator.validateImage(req.file, MAX_BYTES);
      if (!validation.isValid) {
        return apiResponse.error(res, validation.error, validation.code, 400);
      }

      req.file.detected = validation.detected;
      next();
    });
  }
};

module.exports = uploadMiddleware;
