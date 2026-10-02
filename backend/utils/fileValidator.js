/**
 * CampusFix — File & Image Security Validator
 * Validates file magic bytes (file signature), size limits, MIME integrity,
 * and sanitizes filenames against path traversal.
 */

const path = require('path');
const crypto = require('crypto');

// Allowed image formats with their canonical magic byte signatures
const SIGNATURES = {
  jpeg: {
    mime: 'image/jpeg',
    ext: 'jpg',
    check: (buf) => buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF
  },
  png: {
    mime: 'image/png',
    ext: 'png',
    check: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4E &&
      buf[3] === 0x47 &&
      buf[4] === 0x0D &&
      buf[5] === 0x0A &&
      buf[6] === 0x1A &&
      buf[7] === 0x0A
  },
  webp: {
    mime: 'image/webp',
    ext: 'webp',
    check: (buf) =>
      buf.length >= 12 &&
      buf.toString('utf8', 0, 4) === 'RIFF' &&
      buf.toString('utf8', 8, 12) === 'WEBP'
  }
};

const fileValidator = {
  /**
   * Inspects binary buffer magic numbers to determine the genuine image type.
   * Returns metadata if valid, or null if unsupported/spoofed.
   *
   * @param {Buffer} buffer
   * @returns {{ format: string, mime: string, ext: string } | null}
   */
  detectImageType(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return null;
    }

    for (const [format, sig] of Object.entries(SIGNATURES)) {
      if (sig.check(buffer)) {
        return {
          format,
          mime: sig.mime,
          ext: sig.ext
        };
      }
    }

    return null;
  },

  /**
   * Validates an uploaded file object from Multer memory storage.
   *
   * @param {object} file - Express/Multer file object
   * @param {number} maxBytes - Max allowed bytes (defaults to 5 MB)
   * @returns {{ isValid: boolean, error?: string, code?: string, detected?: object }}
   */
  validateImage(file, maxBytes = 5 * 1024 * 1024) {
    if (!file) {
      return {
        isValid: false,
        code: 'NO_FILE_PROVIDED',
        error: 'No image file was uploaded.'
      };
    }

    // 1. Verify buffer existence and check for empty file
    if (!file.buffer || file.buffer.length === 0) {
      return {
        isValid: false,
        code: 'EMPTY_FILE',
        error: 'Uploaded image file cannot be empty (0 bytes).'
      };
    }

    // 2. File size verification
    if (file.buffer.length > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      return {
        isValid: false,
        code: 'FILE_TOO_LARGE',
        error: `File size exceeds the allowed limit of ${maxMb} MB.`
      };
    }

    // 3. Deep Magic Byte Inspection (Anti-Spoofing & Anti-Malware)
    const detected = this.detectImageType(file.buffer);
    if (!detected) {
      return {
        isValid: false,
        code: 'INVALID_FILE_TYPE',
        error: 'Invalid file format. Only authentic JPEG, PNG, and WebP images are allowed.'
      };
    }

    return {
      isValid: true,
      detected
    };
  },

  /**
   * Generates a safe, cryptographically random storage key for the image.
   * Completely discards original client filenames to eliminate directory traversal.
   *
   * @param {string} ext - Detected file extension (e.g. 'jpg', 'png', 'webp')
   * @returns {string} - Secure storage key (e.g. 'complaint-1790940000-a1b2c3d4e5f6.jpg')
   */
  generateSecureKey(ext = 'jpg') {
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(16).toString('hex');
    const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return `complaint-${timestamp}-${randomHex}.${cleanExt}`;
  },

  /**
   * Sanitizes input filename for logging or metadata storage.
   * Strips directory traversal sequences and non-whitelisted characters.
   *
   * @param {string} originalname
   * @returns {string}
   */
  sanitizeOriginalFilename(originalname) {
    if (typeof originalname !== 'string') return 'attachment';
    const basename = path.basename(originalname);
    return basename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  }
};

module.exports = fileValidator;
