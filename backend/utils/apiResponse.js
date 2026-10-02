/**
 * CampusFix — API Response Envelope Helpers
 * Enforces uniform, structured JSON responses across all endpoints.
 */

const apiResponse = {
  success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  },

  error(res, message = 'An error occurred', code = 'INTERNAL_ERROR', statusCode = 500, details = null) {
    const errorBody = {
      code,
      message
    };

    // Include field-level validation details or client-safe error details
    if (details !== null && details !== undefined) {
      if (
        code === 'VALIDATION_ERROR' ||
        statusCode === 400 ||
        Array.isArray(details) ||
        (typeof details === 'object' && !('stack' in details))
      ) {
        errorBody.details = details;
      } else if (process.env.NODE_ENV !== 'production') {
        errorBody.details = details;
      }
    }

    return res.status(statusCode).json({
      success: false,
      error: errorBody
    });
  }
};

module.exports = apiResponse;
