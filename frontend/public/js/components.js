/**
 * CampusFix — Reusable UI Components & Security Helpers
 * XSS escaping, status badges, priority tags, date formatters,
 * toast notifications, modal dialogs, accessible confirmation dialogs,
 * button loading states, and navigation headers.
 */

const components = {
  /**
   * Universal HTML Entity Escaping (Prevents XSS attacks in dynamic DOM inserts)
   */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Generates accessible status badge HTML
   */
  createBadge(status) {
    const s = String(status || 'Pending').toLowerCase().replace(/\s+/g, '-');
    const safeStatus = this.escapeHtml(status || 'Pending');
    return `<span class="badge badge-${s}">${safeStatus}</span>`;
  },

  /**
   * Generates priority indicator tag HTML
   */
  createPriorityTag(priority) {
    const p = String(priority || 'Medium').toLowerCase();
    const safePriority = this.escapeHtml(priority || 'Medium');
    return `<span class="priority-tag priority-${p}">${safePriority}</span>`;
  },

  /**
   * Formats ISO timestamps into human-readable date/time strings
   */
  formatDate(dateStr, includeTime = true) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);

      const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      };

      if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
      }

      return d.toLocaleDateString(undefined, options);
    } catch (e) {
      return String(dateStr);
    }
  },

  /**
   * Generates an accessible, styled alert box HTML
   */
  createAlert(type = 'info', message = '') {
    const safeMsg = this.escapeHtml(message);
    let border = '#93c5fd';
    let bg = 'var(--status-progress-bg)';
    let color = 'var(--status-progress)';
    let icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

    if (type === 'danger' || type === 'error') {
      border = '#fca5a5';
      bg = 'var(--status-rejected-bg)';
      color = 'var(--status-rejected)';
      icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else if (type === 'success') {
      border = '#86efac';
      bg = 'var(--status-resolved-bg)';
      color = 'var(--status-resolved)';
      icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'warning') {
      border = '#fde68a';
      bg = 'var(--status-pending-bg)';
      color = 'var(--status-pending)';
      icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    }

    return `
      <div class="alert alert-${type}" style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.875rem 1rem; border-radius: var(--radius-md); border: 1px solid ${border}; background-color: ${bg}; color: ${color}; font-size: 0.875rem; line-height: 1.4;" role="alert">
        <span style="flex-shrink: 0; margin-top: 1px;">${icon}</span>
        <div style="flex: 1;">${safeMsg}</div>
      </div>
    `;
  },

  /**
   * Helper to set and toggle accessible button loading states
   */
  setButtonLoading(btn, isLoading, loadingText = 'Processing...', originalText = null) {
    if (!btn) return;
    if (isLoading) {
      if (!btn.dataset.originalHtml) {
        btn.dataset.originalHtml = btn.innerHTML;
      }
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px; display: inline-block; vertical-align: middle; margin-right: 0.4rem;"></span><span>${this.escapeHtml(loadingText)}</span>`;
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.innerHTML = btn.dataset.originalHtml || originalText || 'Submit';
      delete btn.dataset.originalHtml;
    }
  },

  /**
   * Triggers an accessible, responsive toast notification
   */
  showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink: 0;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error' || type === 'danger') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink: 0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.6rem; width: 100%;">
        ${iconSvg}
        <span style="flex: 1; word-break: break-word;">${this.escapeHtml(message)}</span>
        <button type="button" aria-label="Dismiss notification" style="background: none; border: none; color: inherit; cursor: pointer; opacity: 0.7; font-size: 1.1rem; line-height: 1; padding: 0 0.2rem;" onclick="this.closest('.toast').remove()">&times;</button>
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(15px)';
      toast.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /**
   * Confirmation Dialog for Destructive / Sensitive Actions (e.g. Reject or Close complaint)
   */
  confirmDialog({ title, message, confirmText = 'Confirm Action', cancelText = 'Cancel', confirmClass = 'btn-primary', onConfirm, onCancel }) {
    const existing = document.getElementById('cf-confirm-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cf-confirm-modal';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'confirm-modal-title');

    const isDanger = confirmClass.includes('danger') || confirmClass.includes('rejected');

    overlay.innerHTML = `
      <div class="modal-content" style="max-width: 460px;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            ${isDanger ? `<span style="color: var(--status-rejected); display: flex;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></span>` : ''}
            <h3 id="confirm-modal-title" class="card-title" style="margin: 0; font-size: 1.125rem;">${this.escapeHtml(title)}</h3>
          </div>
          <button id="confirm-modal-close" aria-label="Close dialog" style="background:none; border:none; font-size:1.25rem; cursor:pointer; color:var(--color-text-muted);">&times;</button>
        </div>
        <div class="modal-body" style="font-size: 0.875rem; color: var(--color-text); line-height: 1.5; padding: 1.25rem 0;">
          ${this.escapeHtml(message)}
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.75rem;">
          <button id="confirm-modal-cancel" class="btn btn-secondary btn-sm">${this.escapeHtml(cancelText)}</button>
          <button id="confirm-modal-action" class="btn ${confirmClass} btn-sm">${this.escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeDialog = () => {
      overlay.remove();
      document.removeEventListener('keydown', handleKey);
    };

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        closeDialog();
        if (onCancel) onCancel();
      }
    };
    document.addEventListener('keydown', handleKey);

    overlay.querySelector('#confirm-modal-close').addEventListener('click', () => {
      closeDialog();
      if (onCancel) onCancel();
    });

    overlay.querySelector('#confirm-modal-cancel').addEventListener('click', () => {
      closeDialog();
      if (onCancel) onCancel();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeDialog();
        if (onCancel) onCancel();
      }
    });

    const actionBtn = overlay.querySelector('#confirm-modal-action');
    actionBtn.focus();

    actionBtn.addEventListener('click', async () => {
      if (onConfirm) {
        actionBtn.disabled = true;
        actionBtn.textContent = 'Processing...';
        try {
          await onConfirm();
          closeDialog();
        } catch (err) {
          actionBtn.disabled = false;
          actionBtn.textContent = confirmText;
          components.showToast(err.message || 'Operation failed', 'error');
        }
      } else {
        closeDialog();
      }
    });
  },

  /**
   * Generic modal dialog builder with accessible keyboard handling
   */
  showModal({ title, bodyHtml, content, confirmText = 'Confirm', confirmClass = 'btn-primary', onConfirm }) {
    const existing = document.getElementById('cf-modal');
    if (existing) existing.remove();

    const finalBody = bodyHtml || content || '';
    const overlay = document.createElement('div');
    overlay.id = 'cf-modal';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-header-title');

    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="modal-header-title" class="card-title">${this.escapeHtml(title)}</h3>
          <button id="modal-close-btn" aria-label="Close dialog" style="background:none; border:none; font-size:1.25rem; cursor:pointer; color:var(--color-text-muted);">&times;</button>
        </div>
        <div class="modal-body" id="modal-body-container">
          ${finalBody}
        </div>
        <div class="modal-footer">
          <button id="modal-cancel-btn" class="btn btn-secondary btn-sm">Cancel</button>
          <button id="modal-confirm-btn" class="btn ${confirmClass} btn-sm">${this.escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => {
      overlay.remove();
      document.removeEventListener('keydown', handleKey);
    };

    const handleKey = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKey);

    overlay.querySelector('#modal-close-btn').addEventListener('click', closeModal);
    overlay.querySelector('#modal-cancel-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    const confirmBtn = overlay.querySelector('#modal-confirm-btn');
    confirmBtn.addEventListener('click', async () => {
      if (onConfirm) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Processing...';
        try {
          await onConfirm();
          closeModal();
        } catch (err) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = confirmText;
          components.showToast(err.message, 'error');
        }
      } else {
        closeModal();
      }
    });
  },

  /**
   * Dynamically renders standard CampusFix navbar into a target container
   */
  renderNavbar(activeKey = '') {
    const navEl = document.getElementById('navbar');
    if (!navEl) return;

    const user = auth.getUser();
    let navLinksHtml = '';

    if (user && user.role === 'student') {
      navLinksHtml = `
        <li><a href="/student/dashboard.html" class="nav-link ${activeKey === 'dashboard' ? 'active' : ''}">Dashboard</a></li>
        <li><a href="/student/complaints.html" class="nav-link ${activeKey === 'complaints' ? 'active' : ''}">My Complaints</a></li>
        <li><a href="/student/submit.html" class="nav-link ${activeKey === 'submit' ? 'active' : ''}">+ Submit Issue</a></li>
        <li style="margin-left: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 0.8125rem; color: var(--color-text-muted); font-weight: 600;">${this.escapeHtml(user.fullName)}</span>
          <button onclick="auth.logout()" class="btn btn-secondary btn-sm" aria-label="Sign out of student account">Sign Out</button>
        </li>
      `;
    } else if (user && user.role === 'admin') {
      navLinksHtml = `
        <li><a href="/admin/dashboard.html" class="nav-link ${activeKey === 'dashboard' ? 'active' : ''}">Admin Overview</a></li>
        <li><a href="/admin/complaints.html" class="nav-link ${activeKey === 'complaints' ? 'active' : ''}">All Complaints</a></li>
        <li style="margin-left: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <span class="badge" style="background-color: #334155; color: #fff;">Staff</span>
          <span style="font-size: 0.8125rem; color: var(--color-text-muted); font-weight: 600;">${this.escapeHtml(user.fullName)}</span>
          <button onclick="auth.logout()" class="btn btn-secondary btn-sm" aria-label="Sign out of admin account">Sign Out</button>
        </li>
      `;
    } else {
      navLinksHtml = `
        <li><a href="/index.html#features" class="nav-link">Features</a></li>
        <li><a href="/index.html#how-it-works" class="nav-link">How It Works</a></li>
        <li><a href="/login.html" class="btn btn-outline btn-sm">Sign In</a></li>
        <li><a href="/register.html" class="btn btn-primary btn-sm">Student Sign Up</a></li>
      `;
    }

    navEl.innerHTML = `
      <nav class="navbar" aria-label="Main Navigation">
        <div class="container navbar-inner">
          <a href="/index.html" class="brand-link" aria-label="CampusFix Homepage">
            <span>CampusFix</span>
            <span class="brand-badge">Facilities Portal</span>
          </a>
          <ul class="nav-links">
            ${navLinksHtml}
          </ul>
        </div>
      </nav>
    `;
  }
};

if (typeof window !== 'undefined') {
  window.components = components;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = components;
}
