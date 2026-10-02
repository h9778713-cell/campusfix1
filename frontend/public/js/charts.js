/**
 * CampusFix — Lightweight Zero-Dependency SVG & CSS Charting Engine
 * Pure Vanilla JavaScript implementation compliant with Strict Content Security Policy.
 * Generates accessible, responsive visual analytics, trends, and distribution bars.
 */

const charts = {
  // Brand & status color palettes
  colors: {
    // Status
    'Pending': '#d97706',
    'In Progress': '#2563eb',
    'Resolved': '#059669',
    'Closed': '#7c3aed',
    'Rejected': '#dc2626',
    // Priority
    'Critical': '#e11d48',
    'High': '#ea580c',
    'Medium': '#0284c7',
    'Low': '#64748b',
    // Default series
    'primary': '#1e3a8a',
    'secondary': '#2563eb',
    'accent': '#059669',
    'neutral': '#94a3b8'
  },

  /**
   * Render Horizontal Bar Breakdown
   * @param {string|HTMLElement} container
   * @param {Array<{label: string, count: number, percentage?: number, color?: string, subtext?: string, link?: string}>} items
   * @param {Object} options
   */
  renderHorizontalBars(container, items, options = {}) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;

    if (!items || items.length === 0) {
      el.innerHTML = `
        <div class="empty-state" style="padding: 2rem 1rem;">
          <p style="color: var(--color-text-muted); font-size: 0.875rem;">${options.emptyMessage || 'No data recorded yet.'}</p>
        </div>
      `;
      return;
    }

    const maxCount = Math.max(...items.map(i => i.count || 0), 1);
    const totalCount = items.reduce((acc, i) => acc + (i.count || 0), 0);

    const rowsHtml = items.map(item => {
      const count = item.count || 0;
      const pct = item.percentage !== undefined ? item.percentage : (totalCount > 0 ? Math.round((count / totalCount) * 1000) / 10 : 0);
      const widthPct = Math.max(0, Math.min(100, (count / maxCount) * 100));
      const color = item.color || this.colors[item.label] || 'var(--color-primary-light)';
      const linkStart = item.link ? `<a href="${item.link}" style="text-decoration: none; color: inherit; display: block;" class="hbar-link">` : '';
      const linkEnd = item.link ? `</a>` : '';

      return `
        ${linkStart}
        <div class="hbar-row" title="${this.escapeHtml(item.label)}: ${count} (${pct}%)" role="group" aria-label="${this.escapeHtml(item.label)}">
          <div class="hbar-meta">
            <span class="hbar-label">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${color}; flex-shrink: 0;"></span>
              <span>${this.escapeHtml(item.label)}</span>
              ${item.subtext ? `<span style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: normal;">(${this.escapeHtml(item.subtext)})</span>` : ''}
            </span>
            <span class="hbar-value">
              <span style="color: var(--color-text-main); font-weight: 700;">${count}</span>
              <span style="font-size: 0.75rem; color: var(--color-text-muted); margin-left: 0.25rem;">(${pct}%)</span>
            </span>
          </div>
          <div class="hbar-track" role="progressbar" aria-valuenow="${count}" aria-valuemin="0" aria-valuemax="${maxCount}">
            <div class="hbar-fill" style="width: ${widthPct}%; background-color: ${color};"></div>
          </div>
        </div>
        ${linkEnd}
      `;
    }).join('');

    el.innerHTML = `<div class="hbar-list">${rowsHtml}</div>`;
  },

  /**
   * Render Responsive SVG Multi-Series Trend Chart (Filed vs Resolved)
   * Pure inline SVG with no canvas or external scripts.
   * @param {string|HTMLElement} container
   * @param {Array<{dateStr: string, filedCount: number, resolvedCount: number}>} trends
   */
  renderTrendChart(container, trends) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;

    if (!trends || trends.length === 0) {
      el.innerHTML = `
        <div class="empty-state" style="padding: 2.5rem 1rem;">
          <p style="color: var(--color-text-muted); font-size: 0.875rem;">No historical grievance trends logged in this period.</p>
        </div>
      `;
      return;
    }

    const width = 600;
    const height = 220;
    const padding = { top: 25, right: 30, bottom: 40, left: 40 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Calculate maximum values for scale
    const maxVal = Math.max(
      ...trends.map(t => Math.max(t.filedCount || 0, t.resolvedCount || 0)),
      4 // baseline minimum scale
    );

    // Compute coordinate points
    const n = trends.length;
    const stepX = n > 1 ? chartW / (n - 1) : chartW / 2;

    const getX = (idx) => padding.left + (n > 1 ? idx * stepX : chartW / 2);
    const getY = (val) => padding.top + chartH - ((val / maxVal) * chartH);

    const filedPoints = trends.map((t, i) => ({ x: getX(i), y: getY(t.filedCount || 0), val: t.filedCount || 0, date: t.dateStr }));
    const resolvedPoints = trends.map((t, i) => ({ x: getX(i), y: getY(t.resolvedCount || 0), val: t.resolvedCount || 0, date: t.dateStr }));

    const filedPoly = filedPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const resolvedPoly = resolvedPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Area polygons
    const filedArea = filedPoints.length > 1
      ? `${filedPoints[0].x.toFixed(1)},${(padding.top + chartH).toFixed(1)} ` +
        filedPoly +
        ` ${filedPoints[filedPoints.length - 1].x.toFixed(1)},${(padding.top + chartH).toFixed(1)}`
      : '';

    // Generate horizontal grid lines & Y labels (4 intervals)
    let gridLines = '';
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const val = Math.round((maxVal / ySteps) * i);
      const y = getY(val);
      gridLines += `
        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="var(--color-border)" stroke-dasharray="3,3" stroke-width="1" />
        <text x="${padding.left - 8}" y="${y + 4}" fill="var(--color-text-muted)" font-size="11" text-anchor="end">${val}</text>
      `;
    }

    // Generate X date labels (stride if many points)
    let xLabels = '';
    const stride = n > 8 ? 2 : 1;
    trends.forEach((t, i) => {
      if (i % stride === 0 || i === n - 1) {
        const x = getX(i);
        const y = height - padding.bottom + 18;
        // Format date: MM-DD
        const label = t.dateStr ? t.dateStr.slice(5) : '';
        xLabels += `
          <text x="${x}" y="${y}" fill="var(--color-text-muted)" font-size="10.5" text-anchor="middle">${label}</text>
        `;
      }
    });

    // Generate dots
    let filedDots = '';
    filedPoints.forEach(p => {
      filedDots += `
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#2563eb" stroke="#ffffff" stroke-width="2">
          <title>${p.date}: ${p.val} Filed</title>
        </circle>
      `;
    });

    let resolvedDots = '';
    resolvedPoints.forEach(p => {
      resolvedDots += `
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#059669" stroke="#ffffff" stroke-width="2">
          <title>${p.date}: ${p.val} Resolved</title>
        </circle>
      `;
    });

    el.innerHTML = `
      <div style="display: flex; justify-content: flex-end; gap: 1.25rem; font-size: 0.8125rem; margin-bottom: 0.5rem; align-items: center;">
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="width: 12px; height: 3px; background: #2563eb; border-radius: 2px;"></span>
          <span style="color: var(--color-text-main); font-weight: 600;">Filed Complaints</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="width: 12px; height: 3px; background: #059669; border-radius: 2px;"></span>
          <span style="color: var(--color-text-main); font-weight: 600;">Resolved</span>
        </div>
      </div>
      <div class="chart-svg-container">
        <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; overflow: visible;" aria-label="Grievance trend chart">
          <defs>
            <linearGradient id="filedGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#2563eb" stop-opacity="0.15"/>
              <stop offset="100%" stop-color="#2563eb" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          ${gridLines}
          ${filedArea ? `<polygon points="${filedArea}" fill="url(#filedGradient)" />` : ''}
          <polyline points="${filedPoly}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          <polyline points="${resolvedPoly}" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          ${xLabels}
          ${filedDots}
          ${resolvedDots}
        </svg>
      </div>
    `;
  },

  /**
   * Render Department Workload Backlog Cards
   * @param {string|HTMLElement} container
   * @param {Array<{departmentId: number, departmentName: string, activeAssignments: number, criticalAssignments: number}>} workload
   */
  renderDepartmentWorkload(container, workload) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;

    if (!workload || workload.length === 0) {
      el.innerHTML = `
        <div class="empty-state" style="padding: 2rem 1rem;">
          <p style="color: var(--color-text-muted); font-size: 0.875rem;">No active maintenance departments configured.</p>
        </div>
      `;
      return;
    }

    const cardsHtml = workload.map(d => {
      const active = d.activeAssignments || 0;
      const critical = d.criticalAssignments || 0;
      const hasCritical = critical > 0;

      return `
        <div class="workload-card" style="${hasCritical ? 'border-left: 3px solid var(--status-rejected);' : ''}">
          <div style="font-weight: 700; font-size: 0.9375rem; color: var(--color-primary-dark); margin-bottom: 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(d.departmentName)}">
            ${this.escapeHtml(d.departmentName)}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.25rem;">
            <span style="font-size: 0.75rem; color: var(--color-text-muted);">Active Tickets</span>
            <span style="font-size: 1.125rem; font-weight: 800; color: var(--color-primary);">${active}</span>
          </div>
          ${hasCritical ? `
            <div style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; color: var(--status-rejected); font-weight: 600; margin-top: 0.35rem;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <span>${critical} Critical</span>
            </div>
          ` : `
            <div style="font-size: 0.75rem; color: var(--status-resolved); font-weight: 500; margin-top: 0.35rem;">
              &check; Normal queue load
            </div>
          `}
        </div>
      `;
    }).join('');

    el.innerHTML = `<div class="workload-grid">${cardsHtml}</div>`;
  },

  /**
   * Render Audit Activity Stream
   * @param {string|HTMLElement} container
   * @param {Array<{activityType: string, complaintId: number, complaintCode: string, complaintTitle: string, actorName: string, actorRole: string, details: string, activityAt: string}>} activities
   */
  renderRecentActivity(container, activities) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;

    if (!activities || activities.length === 0) {
      el.innerHTML = `
        <div class="empty-state" style="padding: 2.5rem 1rem;">
          <p style="color: var(--color-text-muted); font-size: 0.875rem;">No recent administrative activity recorded yet.</p>
        </div>
      `;
      return;
    }

    const itemsHtml = activities.map(act => {
      let icon = '';
      let badgeBg = 'var(--color-primary-subtle)';
      let badgeColor = 'var(--color-primary-light)';

      if (act.activityType === 'status_change') {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        badgeBg = 'var(--status-resolved-bg)';
        badgeColor = 'var(--status-resolved)';
      } else if (act.activityType === 'assignment') {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>`;
        badgeBg = 'var(--status-progress-bg)';
        badgeColor = 'var(--status-progress)';
      } else if (act.activityType === 'internal_note') {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
        badgeBg = 'var(--priority-high-bg)';
        badgeColor = 'var(--priority-high)';
      } else {
        // Comment
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
        badgeBg = 'var(--status-closed-bg)';
        badgeColor = 'var(--status-closed)';
      }

      const timeAgo = this.formatRelativeTime(act.activityAt);

      return `
        <div class="activity-item">
          <div class="activity-icon-badge" style="background: ${badgeBg}; color: ${badgeColor};">
            ${icon}
          </div>
          <div class="activity-content">
            <div class="activity-title-row">
              <span class="activity-actor">
                ${this.escapeHtml(act.actorName || 'Staff')}
                <span style="font-size: 0.75rem; font-weight: normal; color: var(--color-text-muted); margin-left: 0.25rem;">
                  (${this.escapeHtml(act.actorRole || 'user')})
                </span>
              </span>
              <span class="activity-time" title="${this.escapeHtml(act.activityAt)}">${timeAgo}</span>
            </div>
            <div style="font-size: 0.8125rem; margin-bottom: 0.25rem;">
              <a href="/admin/details.html?id=${act.complaintId}" class="activity-code">
                ${this.escapeHtml(act.complaintCode)}
              </a>
              <span style="color: var(--color-text-muted); font-size: 0.75rem; margin-left: 0.25rem;">
                ${this.escapeHtml(act.complaintTitle)}
              </span>
            </div>
            <div class="activity-desc">
              ${this.escapeHtml(act.details)}
            </div>
          </div>
        </div>
      `;
    }).join('');

    el.innerHTML = `<div class="activity-stream">${itemsHtml}</div>`;
  },

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Format ISO date string into human-friendly relative time
   */
  formatRelativeTime(isoStr) {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
};

if (typeof window !== 'undefined') {
  window.charts = charts;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = charts;
}
