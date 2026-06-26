/* ==========================================================================
   App-wide UI feedback — toasts, skeleton loaders, button spinners,
   full-page loader. Source of truth: DESIGN_SPEC.md sections 6.9 / 6.10.
   ========================================================================== */

const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

const TOAST_ICONS = { success: 'check', error: 'close', warning: 'warn', info: 'check' };
const TOAST_PERSISTENT_TYPES = ['error', 'warning'];

function getToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type, duration) {
  const toastType = type || 'info';
  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${toastType} scale-in`;
  toast.innerHTML = `
    <span class="toast-icon">${iconSvg(TOAST_ICONS[toastType] || 'check', 16)}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button type="button" class="toast-close" aria-label="Dismiss">${iconSvg('close', 13)}</button>`;

  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  container.appendChild(toast);

  if (!TOAST_PERSISTENT_TYPES.includes(toastType)) {
    setTimeout(() => toast.remove(), duration || 3000);
  }
}

/* ==========================================================================
   Table skeleton — grey animated rows shown while data loads
   ========================================================================== */

const SKELETON_BAR_WIDTHS = [130, 90, 90, 60, 80, 110, 70, 90, 60];

function tableSkeletonHtml(rows) {
  const rowCount = rows || 5;
  const barsHtml = SKELETON_BAR_WIDTHS.map(w => `<span class="skeleton-bar" style="width:${w}px"></span>`).join('');
  let rowsHtml = '';
  for (let i = 0; i < rowCount; i++) {
    rowsHtml += `<div class="skeleton-row">${barsHtml}</div>`;
  }
  return `<div class="skeleton-table">${rowsHtml}</div>`;
}

/* ==========================================================================
   Button spinner — replaces button content with a spinner while an
   async operation runs, restores it afterwards
   ========================================================================== */

function setButtonLoading(btn, loading, loadingLabel) {
  if (!btn) return;

  if (loading) {
    if (btn.dataset.originalHtml === undefined) {
      btn.dataset.originalHtml = btn.innerHTML;
    }
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span>${loadingLabel ? `<span>${escapeHtml(loadingLabel)}</span>` : ''}`;
  } else {
    if (btn.dataset.originalHtml !== undefined) {
      btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
    }
    btn.disabled = false;
  }
}

/* ==========================================================================
   Full-page loader — shown once on first startup while the database
   initializes (markup lives in index.html so it paints before any JS runs)
   ========================================================================== */

function hideFullPageLoader() {
  const loadingScreen = document.getElementById('loading-screen');
  if (!loadingScreen) return;
  loadingScreen.classList.add('loading-screen-out');
  setTimeout(() => loadingScreen.remove(), 180);
}

/* ==========================================================================
   Form helpers — autofocus, Enter-to-submit, Escape-with-dirty-check.
   DESIGN_SPEC.md section 14 / CLAUDE.md Stage 11.2.
   ========================================================================== */

const FOCUSABLE_FIELD_SELECTOR = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)';

function autofocusFirstField(container, selector) {
  if (!container) return;
  const el = container.querySelector(selector || FOCUSABLE_FIELD_SELECTOR);
  if (el) requestAnimationFrame(() => el.focus());
}

function captureFormSnapshot(container) {
  const snapshot = {};
  if (!container) return snapshot;
  container.querySelectorAll('input, select, textarea').forEach(el => {
    const key = el.id || el.name;
    if (!key) return;
    snapshot[key] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
  });
  return snapshot;
}

function isFormDirty(container, snapshot) {
  if (!container || !snapshot) return false;
  let dirty = false;
  container.querySelectorAll('input, select, textarea').forEach(el => {
    const key = el.id || el.name;
    if (!key) return;
    const current = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
    if (snapshot[key] !== current) dirty = true;
  });
  return dirty;
}

// getContainer/getSnapshot are functions (not values) so the handler always
// reads the live DOM node and snapshot at Escape-time, not at bind-time.
function createModalEscapeHandler(getContainer, getSnapshot, closeFn) {
  return function modalEscapeHandler(e) {
    if (e.key !== 'Escape') return;
    const container = getContainer();
    const snapshot = getSnapshot();
    if (isFormDirty(container, snapshot)) {
      if (!window.confirm('You have unsaved changes. Discard them?')) return;
    }
    closeFn();
  };
}

// Enter submits the modal's primary action, except inside <textarea> (newline)
// and on buttons (native activation already handles Enter).
function enableEnterToSubmit(container, onSubmit) {
  if (!container) return;
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'button') return;
    e.preventDefault();
    if (typeof onSubmit === 'function') onSubmit();
    else if (onSubmit && typeof onSubmit.click === 'function') onSubmit.click();
  });
}

window.showToast = showToast;
window.tableSkeletonHtml = tableSkeletonHtml;
window.setButtonLoading = setButtonLoading;
window.hideFullPageLoader = hideFullPageLoader;
window.DEFAULT_ERROR_MESSAGE = DEFAULT_ERROR_MESSAGE;
window.autofocusFirstField = autofocusFirstField;
window.captureFormSnapshot = captureFormSnapshot;
window.isFormDirty = isFormDirty;
window.createModalEscapeHandler = createModalEscapeHandler;
window.enableEnterToSubmit = enableEnterToSubmit;
