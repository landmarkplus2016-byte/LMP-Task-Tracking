const MASTER_ROLES = ['project_manager', 'acceptance_manager', 'cost_control_manager'];

const ICONS = {
  dashboard: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  tasks: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  import: 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  reports: 'M3 3v18h18M8 16V9m5 7V5m5 11v-4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  rows: 'M3 5h18M3 12h18M3 19h18',
  search: 'M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9',
  chevRight: 'M9 6l6 6-6 6',
  chevLeft: 'M15 6l-6 6 6 6',
  chevDown: 'M6 9l6 6 6-6',
  layers: 'M12 2 2 7l10 5 10-5-10-5Zm10 12-10 5L2 14',
  add: 'M12 5v14M5 12h14',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
  trash: 'M3 6h18M8 6V4h8v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6',
  lock: 'M5 11h14v10H5V11Zm2 0V7a5 5 0 0 1 10 0v4',
  unlock: 'M5 11h14v10H5V11Zm2 0V7a5 5 0 0 1 9.5-2',
  calc: 'M5 3h14v18H5V3Zm3 4h8M8 11h2m3 0h2M8 15h2m3 0h2M8 19h2',
  warn: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  check: 'M20 6 9 17l-5-5',
  close: 'M18 6 6 18M6 6l12 12'
};

const ROUTES = {
  '#dashboard': { render: () => renderDashboard(), roles: null, title: 'Dashboard' },
  '#tasks':     { render: () => renderTasks(),     roles: null, title: 'Tasks' },
  '#import':    { render: () => renderImport(),    roles: ['project_manager'], title: 'Import' },
  '#reports':   { render: () => renderReports(),   roles: MASTER_ROLES, title: 'Reports' },
  '#settings':  { render: () => renderSettings(),  roles: null, title: 'Settings' }
};

function iconSvg(name, size) {
  const s = size || 18;
  const d = ICONS[name] || '';
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

function initials(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ? parts[0][0] : '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function roleLabel(role) {
  const labels = {
    project_manager: 'Project Manager',
    acceptance_manager: 'Acceptance Manager',
    cost_control_manager: 'Cost Control Manager',
    coordinator: 'Coordinator'
  };
  return labels[role] || role;
}

function getNavItems(role) {
  const items = [
    { hash: '#dashboard', label: 'Dashboard', icon: 'dashboard' },
    { hash: '#tasks', label: role === 'coordinator' ? 'My Tasks' : 'All Tasks', icon: 'tasks' }
  ];

  if (role === 'project_manager') {
    items.push({ hash: '#import', label: 'Import', icon: 'import' });
  }

  if (MASTER_ROLES.includes(role)) {
    items.push({ hash: '#reports', label: 'Reports', icon: 'reports' });
  }

  items.push({ hash: '#settings', label: 'Settings', icon: 'settings' });

  return items;
}

function sidebarNavItemHtml(item, currentHash) {
  const active = currentHash === item.hash;
  return `
    <a href="${item.hash}" data-hash="${item.hash}" class="sidebar-nav-item${active ? ' active' : ''}">
      ${active ? '<span class="sidebar-nav-indicator"></span>' : ''}
      <span class="sidebar-nav-icon">${iconSvg(item.icon, 18)}</span>
      <span class="sidebar-nav-label">${escapeHtml(item.label)}</span>
    </a>`;
}

function bottomNavItemHtml(item, currentHash) {
  const active = currentHash === item.hash;
  return `
    <a href="${item.hash}" data-hash="${item.hash}" class="bottom-nav-item${active ? ' active' : ''}">
      ${iconSvg(item.icon, 20)}
      <span>${escapeHtml(item.label)}</span>
    </a>`;
}

function triggerCoordinatorExport() {
  if (typeof window.exportCoordinatorTasks === 'function') {
    window.exportCoordinatorTasks();
  }
}

function renderNav() {
  const user = getCurrentUser();
  if (!user) return;

  const isDesktop = window.innerWidth >= 900;
  const nav = document.getElementById('nav');
  const currentHash = location.hash || '#dashboard';
  const items = getNavItems(user.role);

  nav.className = isDesktop ? 'sidebar' : 'bottom-nav';

  if (isDesktop) {
    const collapsed = localStorage.getItem('pt_sidebar_collapsed') === 'true';
    if (collapsed) nav.classList.add('collapsed');

    nav.innerHTML = `
      <div class="sidebar-brand">
        <div class="sidebar-logo">${iconSvg('layers', 18)}</div>
        <div class="sidebar-brand-text">
          <div class="sidebar-appname">Project Tracker</div>
          <div class="sidebar-subtitle">Telecom Infrastructure</div>
        </div>
      </div>
      <div class="sidebar-nav">
        ${items.map(item => sidebarNavItemHtml(item, currentHash)).join('')}
      </div>
      ${user.role === 'coordinator' ? `
      <div class="sidebar-export-wrap">
        <button id="sidebar-export-btn" class="sidebar-export-btn">
          ${iconSvg('download', 16)}<span>Export</span>
        </button>
      </div>` : ''}
      <div class="sidebar-footer">
        <div class="sidebar-avatar">${escapeHtml(initials(user.name))}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${escapeHtml(user.name)}</div>
          <div class="sidebar-user-role">${escapeHtml(roleLabel(user.role))}</div>
        </div>
        <button id="sidebar-logout-btn" class="sidebar-logout-btn" title="Log out" aria-label="Log out">${iconSvg('logout', 16)}</button>
      </div>`;
  } else {
    nav.innerHTML = items.map(item => bottomNavItemHtml(item, currentHash)).join('') +
      (user.role === 'coordinator' ? `
      <button id="bottom-export-btn" class="bottom-nav-export">
        ${iconSvg('download', 18)}<span>Export</span>
      </button>` : '');
  }

  const logoutBtn = document.getElementById('sidebar-logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  const exportBtn = document.getElementById('sidebar-export-btn') || document.getElementById('bottom-export-btn');
  if (exportBtn) exportBtn.addEventListener('click', triggerCoordinatorExport);

  nav.querySelectorAll('a[data-hash]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(a.dataset.hash);
    });
  });
}

function updateActiveNav(hash) {
  const nav = document.getElementById('nav');
  if (!nav) return;

  nav.querySelectorAll('[data-hash]').forEach(el => {
    const isActive = el.dataset.hash === hash;
    el.classList.toggle('active', isActive);

    if (el.classList.contains('sidebar-nav-item')) {
      const indicator = el.querySelector('.sidebar-nav-indicator');
      if (isActive && !indicator) {
        el.insertAdjacentHTML('afterbegin', '<span class="sidebar-nav-indicator"></span>');
      } else if (!isActive && indicator) {
        indicator.remove();
      }
    }
  });
}

function setBreadcrumb(title) {
  const el = document.getElementById('topbar-current-page');
  if (el) el.textContent = title;
}

function toggleSidebarCollapse() {
  const nav = document.getElementById('nav');
  if (!nav.classList.contains('sidebar')) return;
  const collapsed = nav.classList.toggle('collapsed');
  localStorage.setItem('pt_sidebar_collapsed', collapsed ? 'true' : 'false');
}

function toggleNotifDropdown() {
  const dropdown = document.getElementById('notif-dropdown');
  if (dropdown) dropdown.classList.toggle('hidden');
}

function renderTopbar() {
  const container = document.getElementById('page-topbar');
  if (!container) return;

  container.innerHTML = `
    <button id="sidebar-toggle-btn" class="icon-btn" title="Toggle sidebar" aria-label="Toggle sidebar">${iconSvg('rows', 17)}</button>
    <div class="topbar-breadcrumb">
      <span class="breadcrumb-root">PM Console</span>
      ${iconSvg('chevRight', 14)}
      <span id="topbar-current-page" class="breadcrumb-current"></span>
    </div>
    <div class="topbar-search-wrap">
      ${iconSvg('search', 15)}
      <input id="topbar-search" class="topbar-search" type="text" placeholder="Quick search…">
      <span class="kbd">⌘K</span>
    </div>
    <div class="topbar-notif-wrap">
      <button id="topbar-bell-btn" class="icon-btn" title="Notifications" aria-label="Notifications">
        ${iconSvg('bell', 18)}
        <span class="notif-dot"></span>
      </button>
      <div id="notif-dropdown" class="notif-dropdown card scale-in hidden">
        <div class="notif-empty">No notifications</div>
      </div>
    </div>
    <button id="topbar-export-btn" class="btn sm">${iconSvg('download', 14)}<span>Export</span></button>`;

  document.getElementById('sidebar-toggle-btn').addEventListener('click', toggleSidebarCollapse);
  document.getElementById('topbar-search').addEventListener('focus', () => navigateTo('#tasks'));
  document.getElementById('topbar-bell-btn').addEventListener('click', toggleNotifDropdown);
}

async function renderAppShell() {
  if (typeof window.loadDropdownListsFromSettings === 'function') await window.loadDropdownListsFromSettings();

  const app = document.getElementById('app');
  app.innerHTML = `
    <div id="global-banner-root"></div>
    <header id="page-topbar" class="topbar"></header>
    <div id="presence-bar-root"></div>
    <main id="page-content" class="page-content"></main>`;
  renderTopbar();
  if (typeof window.checkPendingSyncFailure === 'function') window.checkPendingSyncFailure();
  if (typeof window.renderSyncStartupBanner === 'function') window.renderSyncStartupBanner();
  if (typeof window.startPresenceHeartbeat === 'function') window.startPresenceHeartbeat();
  if (typeof window.startAutoBackup === 'function') window.startAutoBackup();
}

function navigateTo(hash) {
  if (location.hash === hash) {
    handleRouteChange();
  } else {
    location.hash = hash;
  }
}

function handleRouteChange() {
  let hash = location.hash || '#dashboard';
  if (!ROUTES[hash]) hash = '#dashboard';

  const route = ROUTES[hash];

  if (route.roles && !requireRole(route.roles)) {
    return;
  }

  setBreadcrumb(route.title);
  updateActiveNav(hash);
  route.render();
}

function renderDashboard() {
  document.getElementById('page-content').innerHTML = '<h1>Dashboard</h1>';
}

function renderReports() {
  document.getElementById('page-content').innerHTML = '<h1>Reports</h1>';
}

window.onLoginSuccess = async function (session) {
  hideFullPageLoader();
  await renderAppShell();
  renderNav();
  handleRouteChange();
};

window.redirectToDashboard = function () {
  navigateTo('#dashboard');
};

const PM_SETUP_CODE = 'LMP-SETUP-2026';

function proceedToReady() {
  const user = getCurrentUser();
  if (!user) {
    renderLoginScreen();
    return;
  }
  renderAppShellReady();
}

async function renderAppShellReady() {
  await renderAppShell();
  renderNav();
  handleRouteChange();
}

function renderAccountLoadingScreen() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div id="loading-screen">
      <div class="page-spinner"></div>
      <div class="loading-text">Loading your account...</div>
    </div>`;
}

function renderFirstLaunchNoScript() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="h-full w-full flex flex-col items-center justify-center gap-6 bg-[var(--bg)] p-6">
      <div class="flex flex-col sm:flex-row gap-5">
        <div class="fade-in w-[280px] bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-6 flex flex-col items-center text-center gap-2" style="box-shadow:var(--shadow)">
          <div class="text-[28px]">📋</div>
          <div class="text-[15px] font-semibold text-[var(--ink)]">I'm a team member</div>
          <div class="text-[12.5px] text-[var(--ink-2)] mb-2">Ask your PM for the credentials package file.</div>
          <button id="load-credentials-btn" type="button" class="h-[34px] px-[14px] rounded-[7px] border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[13px] font-semibold text-[var(--ink)] transition-colors">Load credentials package</button>
        </div>
        <div id="pm-setup-card" class="fade-in w-[280px] bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-6 flex flex-col items-center text-center gap-2" style="box-shadow:var(--shadow)">
          <div class="text-[28px]">🔧</div>
          <div class="text-[15px] font-semibold text-[var(--ink)]">I'm the Project Manager</div>
          <div class="text-[12.5px] text-[var(--ink-2)] mb-2">Set up the app for your team.</div>
          <button id="pm-setup-btn" type="button" class="h-[34px] px-[14px] rounded-[7px] bg-[var(--accent)] hover:bg-[var(--accent-ink)] text-white text-[13px] font-semibold transition-colors" style="box-shadow:var(--shadow-sm)">PM Setup</button>
        </div>
      </div>
      <div id="script-url-entry-zone" class="text-[11.5px] text-[var(--ink-3)] text-center max-w-[420px]">
        <button id="script-url-entry-link" type="button" class="text-[var(--accent)] font-semibold underline">Have the Apps Script URL?</button>
      </div>
    </div>`;

  document.getElementById('load-credentials-btn').addEventListener('click', triggerCredentialsImport);
  document.getElementById('pm-setup-btn').addEventListener('click', () => renderPmSetupGate('pm-setup-card'));
  document.getElementById('script-url-entry-link').addEventListener('click', renderScriptUrlEntryForm);
}

function renderScriptUrlEntryForm() {
  const zone = document.getElementById('script-url-entry-zone');
  if (!zone) return;

  zone.innerHTML = `
    <div class="flex flex-col gap-[6px] w-[280px] mx-auto text-left">
      <span class="text-[11.5px] font-semibold text-[var(--ink-2)]">Paste the Apps Script URL your PM sent you</span>
      <input id="script-url-entry-input" type="text" autocomplete="off" placeholder="https://script.google.com/macros/s/.../exec"
        class="h-[34px] px-[10px] rounded-[7px] border border-[var(--line)] bg-[var(--surface)] text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-bg)] transition-colors">
      <div id="script-url-entry-error" class="hidden text-[12px] text-[var(--red)]"></div>
      <button id="script-url-entry-submit" type="button" class="h-[34px] mt-1 rounded-[7px] bg-[var(--accent)] hover:bg-[var(--accent-ink)] text-white text-[13px] font-semibold transition-colors" style="box-shadow:var(--shadow-sm)">Continue</button>
    </div>`;

  const input = document.getElementById('script-url-entry-input');
  const errorEl = document.getElementById('script-url-entry-error');
  const submitBtn = document.getElementById('script-url-entry-submit');

  async function submitScriptUrl() {
    const url = input.value.trim();
    if (!url) {
      errorEl.textContent = 'Enter the URL your PM shared with you.';
      errorEl.classList.remove('hidden');
      return;
    }

    setButtonLoading(submitBtn, true, 'Connecting…');
    errorEl.classList.add('hidden');

    await db.app_settings.put({ key: 'apps_script_url', value: url, updated_at: new Date() });

    try {
      await syncUsersToLocal(db);
      proceedToReady();
    } catch (err) {
      setButtonLoading(submitBtn, false);
      errorEl.textContent = 'Could not reach that URL. Check it and try again.';
      errorEl.classList.remove('hidden');
    }
  }

  submitBtn.addEventListener('click', submitScriptUrl);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitScriptUrl();
  });
  input.focus();
}

function renderFirstLaunchFailed() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="h-full w-full flex items-center justify-center bg-[var(--bg)]">
      <div id="first-launch-failed-card" class="fade-in w-full max-w-[400px] bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-8 text-center" style="box-shadow:var(--shadow)">
        <div class="text-[28px] text-[var(--amber)]">⚠</div>
        <div class="text-[16px] font-semibold text-[var(--ink)] mt-2">Could not load accounts</div>
        <div class="text-[13px] text-[var(--ink-2)] mt-1 mb-5">Check your internet connection and try again.</div>
        <button id="first-launch-retry-btn" type="button" class="w-full h-[34px] rounded-[7px] bg-[var(--accent)] hover:bg-[var(--accent-ink)] text-white text-[13px] font-semibold transition-colors" style="box-shadow:var(--shadow-sm)">Retry</button>
        <div class="text-[11.5px] text-[var(--ink-3)] my-4">— or —</div>
        <button id="first-launch-credentials-link" type="button" class="text-[12.5px] text-[var(--accent)] font-semibold underline">Load credentials package instead</button>
        <div class="text-[11.5px] text-[var(--ink-3)] mt-5">Are you the PM setting up for the first time?</div>
        <button id="first-launch-pm-setup-link" type="button" class="text-[12.5px] text-[var(--accent)] font-semibold underline mt-1">PM Setup →</button>
      </div>
    </div>`;

  document.getElementById('first-launch-retry-btn').addEventListener('click', () => runFirstLaunchAccountSync());
  document.getElementById('first-launch-credentials-link').addEventListener('click', triggerCredentialsImport);
  document.getElementById('first-launch-pm-setup-link').addEventListener('click', () => renderPmSetupGate('first-launch-failed-card'));
}

function renderPmSetupGate(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="text-[15px] font-semibold text-[var(--ink)]">PM Setup</div>
    <label class="flex flex-col gap-[5px] w-full mt-2">
      <span class="text-[11.5px] font-semibold text-[var(--ink-2)]">Enter setup code</span>
      <input id="pm-setup-code-input" type="text" autocomplete="off"
        class="h-[34px] px-[10px] rounded-[7px] border border-[var(--line)] bg-[var(--surface)] text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-bg)] transition-colors">
    </label>
    <div id="pm-setup-code-error" class="hidden text-[12px] text-[var(--red)] mt-1"></div>
    <button id="pm-setup-code-submit" type="button" class="w-full h-[34px] mt-3 rounded-[7px] bg-[var(--accent)] hover:bg-[var(--accent-ink)] text-white text-[13px] font-semibold transition-colors" style="box-shadow:var(--shadow-sm)">Continue</button>`;

  const input = document.getElementById('pm-setup-code-input');
  const errorEl = document.getElementById('pm-setup-code-error');

  function submitSetupCode() {
    if (input.value === PM_SETUP_CODE) {
      renderSetupWizard();
      return;
    }
    errorEl.textContent = 'Incorrect setup code';
    errorEl.classList.remove('hidden');
    container.classList.remove('shake');
    requestAnimationFrame(() => container.classList.add('shake'));
  }

  document.getElementById('pm-setup-code-submit').addEventListener('click', submitSetupCode);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitSetupCode();
  });
}

function triggerCredentialsImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', handleCredentialsFileSelected);
  input.click();
}

async function handleCredentialsFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data || data.type !== 'credentials_package') {
      showToast('Invalid file. Ask your PM for a credentials package.', 'error');
      return;
    }

    for (const user of data.users || []) {
      await db.users.put(user);
    }

    const settings = data.app_settings || {};
    for (const key of Object.keys(settings)) {
      const entry = settings[key];
      const value = entry && typeof entry === 'object' && 'value' in entry ? entry.value : entry;
      await db.app_settings.put({ key, value, updated_at: new Date() });
    }

    showToast('Account loaded. You can now log in.', 'success');
    proceedToReady();
  } catch (err) {
    showToast('Invalid file. Ask your PM for a credentials package.', 'error');
  }
}

async function runFirstLaunchAccountSync() {
  renderAccountLoadingScreen();

  try {
    await syncUsersToLocal(db);
    proceedToReady();
  } catch (err) {
    if (err.message === 'SCRIPT_URL_NOT_CONFIGURED') {
      renderFirstLaunchNoScript();
    } else {
      renderFirstLaunchFailed();
    }
  }
}

async function init() {
  if (typeof window.initPWA === 'function') window.initPWA();

  try {
    await purgeSoftDeleted();
  } catch (err) {
    hideFullPageLoader();
    showToast('Could not load the local database. Please reload the app.', 'error');
    return;
  }

  let userCount = 0;
  try {
    userCount = await db.users.count();
  } catch (err) {
    hideFullPageLoader();
    showToast('Could not load the local database. Please reload the app.', 'error');
    return;
  }

  hideFullPageLoader();

  if (userCount === 0) {
    await runFirstLaunchAccountSync();
    return;
  }

  proceedToReady();
  syncUsersToLocal(db).catch(() => {
    // Silent failure on background sync — use cached users
  });
}

window.addEventListener('hashchange', handleRouteChange);
document.addEventListener('DOMContentLoaded', init);

window.navigateTo = navigateTo;
window.renderNav = renderNav;
window.renderDashboard = renderDashboard;
window.renderReports = renderReports;
