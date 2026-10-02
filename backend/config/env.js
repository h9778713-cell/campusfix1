/**
 * CampusFix — Environment Configuration & Validation
 * Centralizes all environment variables and ensures safe defaults.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  API_PREFIX: process.env.API_PREFIX || '/api',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5000',

  // Database settings
  DB_SERVER: process.env.DB_SERVER || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '1433', 10),
  DB_NAME: process.env.DB_NAME || 'CampusFixDB',
  DB_USER: process.env.DB_USER || 'campusfix_user',
  DB_PASSWORD: process.env.DB_PASSWORD || 'CampusFix@2026!Pass',
  DB_TRUST_SERVER_CERTIFICATE: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
  DB_ENCRYPT: process.env.DB_ENCRYPT === 'true',
  DB_CONNECTION_TIMEOUT: parseInt(process.env.DB_CONNECTION_TIMEOUT || '15000', 10),
  DB_REQUEST_TIMEOUT: parseInt(process.env.DB_REQUEST_TIMEOUT || '15000', 10),
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '20', 10),
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2', 10),

  // Security & Authentication
  JWT_SECRET: process.env.JWT_SECRET || 'campusfix_jwt_super_secret_key_change_in_production_min32chars!',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || 'campusfix_token',

  // Storage
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'local',
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10),
  ALLOWED_FILE_TYPES: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/webp,image/gif').split(','),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),

  isProduction() {
    return this.NODE_ENV === 'production';
  },

  isDevelopment() {
    return this.NODE_ENV === 'development';
  },

  validateProductionSecrets() {
    if (this.isProduction()) {
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change_in_production') || process.env.JWT_SECRET.length < 32) {
        throw new Error('FATAL SECURITY ERROR: In production mode, a strong custom JWT_SECRET (min 32 characters) must be provided.');
      }
      if (!process.env.DB_PASSWORD) {
        throw new Error('FATAL SECURITY ERROR: In production mode, DB_PASSWORD must be explicitly provided in environment.');
      }
    }
    return true;
  }
};

module.exports = env;
