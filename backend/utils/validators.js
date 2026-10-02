/**
 * CampusFix — Request Input Validators
 * Server-side input validation and sanitization helpers.
 */

const validator = require('validator');

const VALID_STATUSES = ['Pending', 'In Progress', 'Resolved', 'Closed', 'Rejected'];
const VALID_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const validators = {
  VALID_STATUSES,
  VALID_PRIORITIES,

  /**
   * Validates student registration payload.
   */
  validateRegistration(data = {}) {
    const errors = {};

    const fullName = typeof data.fullName === 'string' ? data.fullName.trim() : '';
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const password = typeof data.password === 'string' ? data.password : '';
    const studentId = typeof data.studentId === 'string' ? data.studentId.trim().toUpperCase() : '';
    const phone = typeof data.phone === 'string' ? data.phone.trim() : '';

    if (!fullName) {
      errors.fullName = 'Full name is required.';
    } else if (fullName.length < 2 || fullName.length > 150) {
      errors.fullName = 'Full name must be between 2 and 150 characters.';
    }

    if (!email) {
      errors.email = 'Email address is required.';
    } else if (!validator.isEmail(email)) {
      errors.email = 'Please provide a valid email address.';
    } else if (email.length > 255) {
      errors.email = 'Email address cannot exceed 255 characters.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else {
      const passwordErrors = [];
      if (password.length < 8) passwordErrors.push('at least 8 characters');
      if (!/[A-Z]/.test(password)) passwordErrors.push('one uppercase letter');
      if (!/[a-z]/.test(password)) passwordErrors.push('one lowercase letter');
      if (!/[0-9]/.test(password)) passwordErrors.push('one number');
      if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) passwordErrors.push('one special character');

      if (passwordErrors.length > 0) {
        errors.password = `Password must contain ${passwordErrors.join(', ')}.`;
      }
    }

    if (!studentId) {
      errors.studentId = 'Student ID / Roll number is required.';
    } else if (studentId.length < 3 || studentId.length > 50) {
      errors.studentId = 'Student ID must be between 3 and 50 characters.';
    }

    if (phone && !/^\+?[0-9\s\-()]{7,25}$/.test(phone)) {
      errors.phone = 'Please provide a valid phone number or leave blank.';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      sanitized: {
        fullName,
        email,
        password,
        studentId,
        phone: phone || null
      }
    };
  },

  /**
   * Validates user login payload.
   */
  validateLogin(data = {}) {
    const errors = {};

    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const password = typeof data.password === 'string' ? data.password : '';

    if (!email) {
      errors.email = 'Email address is required.';
    } else if (!validator.isEmail(email)) {
      errors.email = 'Please provide a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      sanitized: {
        email,
        password
      }
    };
  },

  /**
   * Validates complaint submission payload.
   */
  validateComplaint(data = {}) {
    const errors = {};

    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    const categoryId = parseInt(data.categoryId, 10);
    const building = typeof data.building === 'string' ? data.building.trim() : '';
    const roomNumber = typeof data.roomNumber === 'string' ? data.roomNumber.trim() : '';
    const priority = typeof data.priority === 'string' ? data.priority.trim() : 'Medium';
    const imageUrl = typeof data.imageUrl === 'string' ? data.imageUrl.trim() : null;
    const imageKey = typeof data.imageKey === 'string' ? data.imageKey.trim() : null;

    if (!title) {
      errors.title = 'Complaint title is required.';
    } else if (title.length < 5 || title.length > 200) {
      errors.title = 'Title must be between 5 and 200 characters.';
    }

    if (!description) {
      errors.description = 'Complaint description is required.';
    } else if (description.length < 10 || description.length > 3000) {
      errors.description = 'Description must be between 10 and 3000 characters.';
    }

    if (isNaN(categoryId) || categoryId <= 0) {
      errors.categoryId = 'A valid category must be selected.';
    }

    if (!building) {
      errors.building = 'Campus building / location is required.';
    } else if (building.length < 2 || building.length > 120) {
      errors.building = 'Building name must be between 2 and 120 characters.';
    }

    if (roomNumber && roomNumber.length > 50) {
      errors.roomNumber = 'Room number cannot exceed 50 characters.';
    }

    if (!VALID_PRIORITIES.includes(priority)) {
      errors.priority = `Priority must be one of: ${VALID_PRIORITIES.join(', ')}.`;
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      sanitized: {
        title,
        description,
        categoryId,
        building,
        roomNumber: roomNumber || null,
        priority,
        imageUrl: imageUrl || null,
        imageKey: imageKey || null
      }
    };
  },

  /**
   * Validates complaint status update payload.
   */
  validateStatusUpdate(data = {}) {
    const errors = {};
    const status = typeof data.status === 'string' ? data.status.trim() : '';
    const remarks = typeof data.remarks === 'string' ? data.remarks.trim() : '';

    if (!VALID_STATUSES.includes(status)) {
      errors.status = `Status must be one of: ${VALID_STATUSES.join(', ')}.`;
    }

    if (remarks && remarks.length > 500) {
      errors.remarks = 'Remarks cannot exceed 500 characters.';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      sanitized: {
        status,
        remarks: remarks || null
      }
    };
  },

  /**
   * Validates complaint priority update payload.
   */
  validatePriorityUpdate(data = {}) {
    const errors = {};
    const priority = typeof data.priority === 'string' ? data.priority.trim() : '';

    if (!VALID_PRIORITIES.includes(priority)) {
      errors.priority = `Priority must be one of: ${VALID_PRIORITIES.join(', ')}.`;
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      sanitized: {
        priority
      }
    };
  },

  /**
   * Validates complaint assignment payload.
   */
  validateAssignment(data = {}) {
    const errors = {};
    const departmentId = parseInt(data.departmentId, 10);
    const assignedToUserId = data.assignedToUserId ? parseInt(data.assignedToUserId, 10) : null;
    const assignmentNotes = typeof data.notes === 'string' ? data.notes.trim() : (typeof data.assignmentNotes === 'string' ? data.assignmentNotes.trim() : '');

    if (isNaN(departmentId) || departmentId <= 0) {
      errors.departmentId = 'Valid department must be selected.';
    }

    if (assignedToUserId !== null && (isNaN(assignedToUserId) || assignedToUserId <= 0)) {
      errors.assignedToUserId = 'Invalid technician or staff user ID.';
    }

    if (assignmentNotes && assignmentNotes.length > 500) {
      errors.assignmentNotes = 'Assignment notes cannot exceed 500 characters.';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      sanitized: {
        departmentId,
        assignedToUserId,
        assignmentNotes: assignmentNotes || null
      }
    };
  },

  /**
   * Validates comment payload.
   */
  validateComment(data = {}) {
    const errors = {};
    const rawText = typeof data.commentText === 'string' ? data.commentText : (typeof data.message === 'string' ? data.message : (typeof data.comment === 'string' ? data.comment : ''));
    const commentText = rawText.trim();
    const isAdminOnly = Boolean(data.isAdminOnly);

    if (!commentText) {
      errors.commentText = 'Comment text is required.';
    } else if (commentText.length < 2 || commentText.length > 2000) {
      errors.commentText = 'Comment must be between 2 and 2000 characters.';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      sanitized: {
        commentText,
        isAdminOnly
      }
    };
  }
};

module.exports = validators;
