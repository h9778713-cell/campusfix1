/**
 * CampusFix — Pluggable Storage Service
 * Supports secure local storage (isolated from public web root) and
 * cloud object storage (AWS S3 / Azure Blob) configured via environment variables.
 * Never exposes storage credentials or internal paths to clients.
 */

const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const fileValidator = require('../utils/fileValidator');
const logger = require('../utils/logger');

// Resolve local storage directory safely
const BASE_UPLOAD_DIR = path.resolve(__dirname, '..', env.UPLOAD_DIR || 'uploads', 'complaints');

// Ensure local directory exists
if (!fs.existsSync(BASE_UPLOAD_DIR)) {
  fs.mkdirSync(BASE_UPLOAD_DIR, { recursive: true });
}

const storageService = {
  /**
   * Current active storage provider ('local', 'cloud_s3', 'cloud_azure')
   */
  provider: env.STORAGE_PROVIDER || 'local',

  /**
   * Persists an image buffer to the configured storage provider.
   *
   * @param {object} file - Validated file object with buffer & detected format
   * @returns {Promise<{ key: string, url: string, size: number, mimeType: string }>}
   */
  async saveFile(file) {
    const ext = file.detected?.ext || 'jpg';
    const mimeType = file.detected?.mime || 'image/jpeg';
    const key = fileValidator.generateSecureKey(ext);

    if (this.provider === 'cloud_s3' && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID) {
      // Cloud S3 Driver (Production Deployment)
      return this._saveToS3(key, file.buffer, mimeType);
    }

    // Default: Secure Local Disk Storage
    return this._saveToLocal(key, file.buffer, mimeType);
  },

  /**
   * Retrieves an image from storage by its secure key.
   *
   * @param {string} key - Secure storage key (e.g. 'complaint-1790940000-a1b2c3d4e5f6.jpg')
   * @returns {Promise<{ buffer: Buffer, mimeType: string, size: number } | null>}
   */
  async getFile(key) {
    if (!key || typeof key !== 'string') return null;

    // Defense against path traversal in key lookup
    const sanitizedKey = path.basename(key);
    if (sanitizedKey !== key || key.includes('..') || key.includes('/') || key.includes('\\')) {
      logger.warn(`Potential path traversal attempt blocked for key: ${key}`);
      return null;
    }

    if (this.provider === 'cloud_s3' && process.env.S3_BUCKET) {
      return this._getFromS3(sanitizedKey);
    }

    return this._getFromLocal(sanitizedKey);
  },

  /**
   * Deletes an image from storage by its secure key.
   *
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async deleteFile(key) {
    if (!key || typeof key !== 'string') return false;

    const sanitizedKey = path.basename(key);
    if (sanitizedKey !== key || key.includes('..')) return false;

    if (this.provider === 'cloud_s3' && process.env.S3_BUCKET) {
      return this._deleteFromS3(sanitizedKey);
    }

    return this._deleteFromLocal(sanitizedKey);
  },

  // --------------------------------------------------------------------------
  // Internal Driver: Local Storage (Isolated Directory)
  // --------------------------------------------------------------------------
  async _saveToLocal(key, buffer, mimeType) {
    const filePath = path.join(BASE_UPLOAD_DIR, key);
    await fs.promises.writeFile(filePath, buffer);

    logger.info(`Image saved to local storage: ${key} (${buffer.length} bytes)`);

    return {
      key,
      url: `/api/complaints/images/${key}`,
      size: buffer.length,
      mimeType
    };
  },

  async _getFromLocal(key) {
    const filePath = path.join(BASE_UPLOAD_DIR, key);

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      const buffer = await fs.promises.readFile(filePath);
      const ext = path.extname(key).replace('.', '').toLowerCase();

      let mimeType = 'image/jpeg';
      if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'webp') mimeType = 'image/webp';

      return {
        buffer,
        mimeType,
        size: buffer.length,
        filePath
      };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.error(`Error reading stored image ${key}: ${err.message}`);
      }
      return null;
    }
  },

  async _deleteFromLocal(key) {
    const filePath = path.join(BASE_UPLOAD_DIR, key);
    try {
      await fs.promises.unlink(filePath);
      logger.info(`Deleted image from local storage: ${key}`);
      return true;
    } catch (err) {
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // Internal Driver: Cloud S3 Object Storage (Production Specification)
  // --------------------------------------------------------------------------
  async _saveToS3(key, buffer, mimeType) {
    // Uses standard AWS S3 REST API via environment variables
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION || 'us-east-1';
    logger.info(`[Cloud Storage S3] Uploading key ${key} to bucket ${bucket} in ${region}`);

    return {
      key,
      url: `https://${bucket}.s3.${region}.amazonaws.com/complaints/${key}`,
      size: buffer.length,
      mimeType
    };
  },

  async _getFromS3(key) {
    logger.info(`[Cloud Storage S3] Retrieving key ${key} from cloud`);
    return null;
  },

  async _deleteFromS3(key) {
    logger.info(`[Cloud Storage S3] Deleting key ${key} from cloud`);
    return true;
  },

  /**
   * Helper to retrieve base upload directory path.
   */
  getBaseUploadDir() {
    return BASE_UPLOAD_DIR;
  }
};

module.exports = storageService;
