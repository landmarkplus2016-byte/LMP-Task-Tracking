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
  check: 'M20 6 9 17l-5-5'
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
        <button id="sidebar-logout-btn" class="sidebar-logout-btn" title="Log out">${iconSvg('logout', 16)}</button>
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
    <button id="sidebar-toggle-btn" class="icon-btn" title="Toggle sidebar">${iconSvg('rows', 17)}</button>
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
      <button id="topbar-bell-btn" class="icon-btn" title="Notifications">
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

function renderAppShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header id="page-topbar" class="topbar"></header>
    <main id="page-content" class="page-content"></main>`;
  renderTopbar();
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

function renderImport() {
  document.getElementById('page-content').innerHTML = '<h1>Import</h1>';
}

function renderReports() {
  document.getElementById('page-content').innerHTML = '<h1>Reports</h1>';
}

function renderSettings() {
  document.getElementById('page-content').innerHTML = '<h1>Settings</h1>';
}

window.onLoginSuccess = function (session) {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) loadingScreen.remove();
  renderAppShell();
  renderNav();
  handleRouteChange();
};

window.redirectToDashboard = function () {
  navigateTo('#dashboard');
};

async function init() {
  await purgeSoftDeleted();
  const { needsSetup } = await runSeed();

  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) loadingScreen.remove();

  if (needsSetup) {
    renderSetupWizard();
    return;
  }

  const user = getCurrentUser();
  if (!user) {
    renderLoginScreen();
    return;
  }

  renderAppShell();
  renderNav();
  handleRouteChange();
}

window.addEventListener('hashchange', handleRouteChange);
document.addEventListener('DOMContentLoaded', init);

window.navigateTo = navigateTo;
window.renderNav = renderNav;
window.renderDashboard = renderDashboard;
window.renderImport = renderImport;
window.renderReports = renderReports;
window.renderSettings = renderSettings;
