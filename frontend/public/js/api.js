/**
 * CampusFix — Centralized API Client Service
 * Interacts with Node.js/Express backend, manages Bearer tokens,
 * handles multipart file uploads, and standardizes error envelopes.
 */

const API_BASE = '/api';

const api = {
  /**
   * Retrieves the active JWT token from storage.
   */
  getToken() {
    return localStorage.getItem('campusfix_token');
  },

  /**
   * Sets the active session token in storage.
   */
  setToken(token) {
    if (token) {
      localStorage.setItem('campusfix_token', token);
    } else {
      localStorage.removeItem('campusfix_token');
    }
  },

  /**
   * Core request dispatcher with authentication headers and error handling.
   */
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const token = this.getToken();

    const headers = { ...options.headers };

    // Automatically attach Bearer token if present
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Default to JSON body unless FormData is passed
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, { ...options, headers });

      // Handle unauthenticated expired session
      if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register')) {
        this.setToken(null);
        localStorage.removeItem('campusfix_user');
        if (!window.location.pathname.includes('login.html')) {
          window.location.href = '/login.html?session=expired';
        }
        throw new Error('Your session has expired. Please sign in again.');
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type') || '';
      let data = null;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else if (contentType.startsWith('image/')) {
        return response.blob();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        let errorMsg = data?.error?.message || data?.message;
        if (!errorMsg) {
          switch (response.status) {
            case 400: errorMsg = 'Invalid request. Please check the submitted form data.'; break;
            case 401: errorMsg = 'Authentication required. Please sign in to proceed.'; break;
            case 403: errorMsg = 'Access denied. You do not have permission for this resource.'; break;
            case 404: errorMsg = 'Requested item or record was not found.'; break;
            case 409: errorMsg = 'A conflict occurred. This record may already exist.'; break;
            case 413: errorMsg = 'Uploaded file or payload exceeds the maximum allowed size (5 MB limit).'; break;
            case 429: errorMsg = 'Too many requests. Please wait a moment and try again.'; break;
            case 500:
            default: errorMsg = 'An internal server error occurred. Please try again later.'; break;
          }
        }
        const error = new Error(errorMsg);
        error.code = data?.error?.code || `HTTP_${response.status}`;
        error.status = response.status;
        error.details = data?.error?.details || null;
        throw error;
      }

      return data;
    } catch (err) {
      // Catch network-level disconnects (backend offline, CORS failure)
      if (err.name === 'TypeError' && (err.message.includes('fetch') || err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        const netErr = new Error('Cannot connect to CampusFix server. Please check your connection or contact IT helpdesk.');
        netErr.status = 0;
        netErr.code = 'NETWORK_ERROR';
        throw netErr;
      }
      throw err;
    }
  },

  get(endpoint, params = null) {
    let url = endpoint;
    if (params) {
      const query = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== null && val !== undefined && val !== '') {
          query.append(key, val);
        }
      }
      const qs = query.toString();
      if (qs) url += `?${qs}`;
    }
    return this.request(url, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body });
  },

  patch(endpoint, body) {
    return this.request(endpoint, { method: 'PATCH', body });
  },

  upload(endpoint, formData) {
    return this.request(endpoint, {
      method: 'POST',
      body: formData
    });
  },

  /**
   * Safely formats client-friendly error messages from API or network exceptions.
   */
  getErrorMessage(err) {
    if (!err) return 'An unexpected error occurred. Please try again.';
    if (err.details && typeof err.details === 'object' && !Array.isArray(err.details)) {
      const messages = Object.values(err.details).filter(Boolean);
      if (messages.length > 0) {
        return messages.join(' ');
      }
    }
    return err.message || 'Operation could not be completed. Please try again.';
  }
};

if (typeof window !== 'undefined') {
  window.api = api;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
