/**
 * CampusFix — Security Middleware
 * Configures Helmet headers, CORS policies, and IP rate-limiting guards.
 */

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const apiResponse = require('../utils/apiResponse');

/**
 * Helmet Security Headers Middleware
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: env.isProduction() ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' }
});

/**
 * CORS Middleware Configuration
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser agents, curl, or same-origin requests
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      env.CLIENT_URL,
      'http://localhost:5000',
      'http://127.0.0.1:5000',
      'http://localhost:3000'
    ];

    const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

    if (allowedOrigins.indexOf(origin) !== -1 || (env.isDevelopment() && isLocalOrigin)) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

const corsMiddleware = cors(corsOptions);

/**
 * General API Rate Limiter
 * Maximum 100 requests per 15 minutes per IP
 */
const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return apiResponse.error(
      res,
      'Too many requests from this IP address. Please try again later.',
      'RATE_LIMIT_EXCEEDED',
      429
    );
  }
});

/**
 * Authentication Rate Limiter (Brute-Force Guard)
 * Maximum 10 attempts per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return apiResponse.error(
      res,
      'Too many authentication attempts. Account access is temporarily throttled. Please try again after 15 minutes.',
      'AUTH_THROTTLED',
      429
    );
  }
});

/**
 * Registration Rate Limiter (Anti-Spam & Bot Guard)
 * Maximum 30 registrations per 15 minutes per IP
 */
const registerLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return apiResponse.error(
      res,
      'Too many registration requests from this IP. Please try again after 15 minutes.',
      'REGISTRATION_THROTTLED',
      429
    );
  }
});

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  generalLimiter,
  authLimiter,
  registerLimiter
};
