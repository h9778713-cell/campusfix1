/**
 * CampusFix — Authentication & Session State Manager
 * Handles user identity, route protection guards, and role-based redirects.
 */

const auth = {
  getUser() {
    const raw = localStorage.getItem('campusfix_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem('campusfix_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('campusfix_user');
    }
  },

  setSession(token, user) {
    api.setToken(token);
    this.setUser(user);
  },

  clearSession() {
    api.setToken(null);
    this.setUser(null);
  },

  isAuthenticated() {
    return Boolean(api.getToken() && this.getUser());
  },

  isAdmin() {
    const user = this.getUser();
    return user && user.role === 'admin';
  },

  isStudent() {
    const user = this.getUser();
    return user && user.role === 'student';
  },

  /**
   * Route Guard: Protects private pages.
   * Redirects unauthenticated users to login, and unauthorized roles to proper portals.
   */
  requireAuth(requiredRole = null) {
    if (!this.isAuthenticated()) {
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login.html?returnUrl=${returnUrl}`;
      return null;
    }

    const user = this.getUser();
    if (requiredRole && user.role !== requiredRole) {
      if (user.role === 'admin') {
        window.location.href = '/admin/dashboard.html';
      } else {
        window.location.href = '/student/dashboard.html';
      }
      return null;
    }

    return user;
  },

  /**
   * Guest Guard: Prevents authenticated users from seeing Login/Register forms.
   */
  requireGuest() {
    if (this.isAuthenticated()) {
      const user = this.getUser();
      if (user.role === 'admin') {
        window.location.href = '/admin/dashboard.html';
      } else {
        window.location.href = '/student/dashboard.html';
      }
      return false;
    }
    return true;
  },

  /**
   * Log out user and clean session state.
   */
  async logout() {
    try {
      await api.post('/auth/logout', {});
    } catch (e) {
      // Ignore API errors during client-side logout
    } finally {
      this.clearSession();
      window.location.href = '/login.html?loggedOut=true';
    }
  }
};

if (typeof window !== 'undefined') {
  window.auth = auth;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = auth;
}
