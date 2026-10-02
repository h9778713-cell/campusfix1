/**
 * CampusFix — Authentication Utilities
 * Cryptographic helpers for password hashing, token generation, and secure cookie handling.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const authUtils = {
  /**
   * Hashes a plaintext password using bcrypt with 12 rounds.
   * @param {string} password
   * @returns {Promise<string>}
   */
  async hashPassword(password) {
    return await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  },

  /**
   * Verifies plaintext password against a stored bcrypt hash.
   * @param {string} password
   * @param {string} hash
   * @returns {Promise<boolean>}
   */
  async comparePassword(password, hash) {
    if (!password || !hash) return false;
    return await bcrypt.compare(password, hash);
  },

  /**
   * Generates a signed JSON Web Token for an authenticated user.
   * Excludes sensitive data (password hash).
   * @param {object} user
   * @returns {string}
   */
  generateToken(user) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role
    };

    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
      issuer: 'campusfix-api'
    });
  },

  /**
   * Verifies and decodes a JWT token.
   * @param {string} token
   * @returns {object}
   */
  verifyToken(token) {
    return jwt.verify(token, env.JWT_SECRET, {
      issuer: 'campusfix-api'
    });
  },

  /**
   * Sets a secure HttpOnly session cookie on the response.
   * @param {object} res
   * @param {string} token
   */
  setAuthCookie(res, token) {
    const isProd = env.isProduction();
    res.cookie(env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      path: '/'
    });
  },

  /**
   * Clears the authentication cookie.
   * @param {object} res
   */
  clearAuthCookie(res) {
    const isProd = env.isProduction();
    res.clearCookie(env.SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/'
    });
  }
};

module.exports = authUtils;
