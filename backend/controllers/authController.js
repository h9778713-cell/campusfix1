/**
 * CampusFix — Authentication Controller
 * Handles student registration, credential verification, JWT issuance,
 * profile retrieval, and secure logout.
 */

const validators = require('../utils/validators');
const userModel = require('../models/userModel');
const authUtils = require('../utils/authUtils');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const authController = {
  /**
   * Student Self-Registration
   * POST /api/auth/register
   */
  async register(req, res, next) {
    try {
      // 1. Validate incoming payload
      const validation = validators.validateRegistration(req.body);
      if (!validation.isValid) {
        return apiResponse.error(
          res,
          'Validation failed. Please correct the highlighted errors.',
          'VALIDATION_ERROR',
          400,
          validation.errors
        );
      }

      const { fullName, email, password, studentId, phone } = validation.sanitized;

      // 2. Check for duplicate email or studentId
      const duplicates = await userModel.checkDuplicates(email, studentId);
      if (duplicates.emailExists) {
        return apiResponse.error(
          res,
          'An account with this email address already exists.',
          'EMAIL_EXISTS',
          409
        );
      }
      if (duplicates.studentIdExists) {
        return apiResponse.error(
          res,
          'An account with this Student ID is already registered.',
          'STUDENT_ID_EXISTS',
          409
        );
      }

      // 3. Hash password securely using bcrypt (12 rounds)
      const passwordHash = await authUtils.hashPassword(password);

      // 4. Persist student in database (role 'student' is strictly hardcoded in userModel)
      const newStudent = await userModel.createStudent({
        fullName,
        email,
        passwordHash,
        studentId,
        phone
      });

      // 5. Generate authentication token
      const token = authUtils.generateToken(newStudent);

      // 6. Set HttpOnly session cookie
      authUtils.setAuthCookie(res, token);

      logger.info(`New student registered successfully: ${newStudent.email} (ID: ${newStudent.id})`);

      return apiResponse.success(
        res,
        {
          user: newStudent,
          token
        },
        'Registration successful. Welcome to CampusFix!',
        201
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * User Login (Student or Admin)
   * POST /api/auth/login
   */
  async login(req, res, next) {
    try {
      // 1. Validate payload format
      const validation = validators.validateLogin(req.body);
      if (!validation.isValid) {
        return apiResponse.error(
          res,
          'Please provide both email and password.',
          'VALIDATION_ERROR',
          400,
          validation.errors
        );
      }

      const { email, password } = validation.sanitized;

      // 2. Fetch user from database
      const user = await userModel.findByEmail(email);

      // Uniform error message against user enumeration attacks
      const invalidCredentialsMessage = 'Invalid email or password provided.';

      if (!user) {
        // Execute dummy bcrypt comparison to defend against timing attacks
        await authUtils.comparePassword('dummy_password', '$2a$12$7vh9dbiDGZGAyPXkqeWSzer2b2AjVbLZBn3jimQ.JHKxFuO2m9re2');
        return apiResponse.error(res, invalidCredentialsMessage, 'INVALID_CREDENTIALS', 401);
      }

      // 3. Verify password hash
      const isMatch = await authUtils.comparePassword(password, user.passwordHash);
      if (!isMatch) {
        return apiResponse.error(res, invalidCredentialsMessage, 'INVALID_CREDENTIALS', 401);
      }

      // 4. Verify account active state
      if (!user.isActive) {
        return apiResponse.error(
          res,
          'This account has been deactivated. Please contact campus administration.',
          'ACCOUNT_DEACTIVATED',
          403
        );
      }

      // 5. Generate JWT token
      const token = authUtils.generateToken(user);

      // 6. Set HttpOnly cookie
      authUtils.setAuthCookie(res, token);

      const userProfile = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        phone: user.phone
      };

      logger.info(`User logged in: ${user.email} [Role: ${user.role}]`);

      return apiResponse.success(
        res,
        {
          user: userProfile,
          token
        },
        `Welcome back, ${user.fullName}!`
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * Current Authenticated User Profile
   * GET /api/auth/me
   */
  async getMe(req, res) {
    return apiResponse.success(
      res,
      { user: req.user },
      'Profile retrieved successfully.'
    );
  },

  /**
   * Logout User (Clears Session Cookie)
   * POST /api/auth/logout
   */
  async logout(req, res) {
    authUtils.clearAuthCookie(res);
    return apiResponse.success(res, null, 'Logged out successfully.');
  }
};

module.exports = authController;
