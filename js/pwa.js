/* ==========================================================================
   PWA chrome — service worker registration, update banner, install prompt,
   offline/online indicator (CLAUDE.md Stage 10.3)
   ========================================================================== */

const INSTALL_DISMISS_KEY = 'pt_install_dismissed_at';
const INSTALL_DISMISS_DAYS = 7;
const PWA_INSTALLED_KEY = 'pt_pwa_installed';

let deferredInstallPrompt = null;

function getOrCreateTopBannerRoot() {
  let root = document.getElementById('pwa-top-banner-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'pwa-top-banner-root';
    document.body.appendChild(root);
  }
  return root;
}

function removeBanner(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

/* ==========================================================================
   Service worker registration + update banner
   ========================================================================== */

function showUpdateBanner(waitingWorker) {
  const id = 'pwa-update-banner';
  if (document.getElementById(id)) return;

  const el = document.createElement('div');
  el.id = id;
  el.className = 'pwa-update-banner scale-in';
  el.innerHTML = `
    <span>A new version of Project Tracker is available.</span>
    <button id="pwa-update-btn" class="btn primary sm">Update Now</button>`;
  document.body.appendChild(el);

  document.getElementById('pwa-update-btn').addEventListener('click', () => {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });

  const dismissOnOutsideClick = (e) => {
    if (el.isConnected && !el.contains(e.target)) {
      el.remove();
      document.removeEventListener('click', dismissOnOutsideClick);
    }
  };
  document.addEventListener('click', dismissOnOutsideClick);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('sw.js').then((registration) => {
    if (registration.waiting) {
      showUpdateBanner(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && registration.waiting) {
          showUpdateBanner(registration.waiting);
        }
      });
    });
  }).catch(() => {});

  let reloadedAfterUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedAfterUpdate) return;
    reloadedAfterUpdate = true;
    location.reload();
  });
}

/* ==========================================================================
   Offline / online indicator
   ========================================================================== */

function showOfflineBanner() {
  const id = 'pwa-offline-banner';
  removeBanner(id);
  const el = document.createElement('div');
  el.id = id;
  el.className = 'pwa-status-banner pwa-status-offline scale-in';
  el.textContent = 'Working offline — changes saved locally';
  getOrCreateTopBannerRoot().appendChild(el);
}

function showBackOnlineBanner() {
  removeBanner('pwa-offline-banner');
  const id = 'pwa-offline-banner';
  const el = document.createElement('div');
  el.id = id;
  el.className = 'pwa-status-banner pwa-status-online scale-in';
  el.textContent = 'Back online';
  getOrCreateTopBannerRoot().appendChild(el);
  setTimeout(() => removeBanner(id), 3000);
}

function initOfflineIndicator() {
  if (!navigator.onLine) showOfflineBanner();
  window.addEventListener('offline', showOfflineBanner);
  window.addEventListener('online', showBackOnlineBanner);
}

/* ==========================================================================
   Install prompt
   ========================================================================== */

function isInstallDismissed() {
  const ts = localStorage.getItem(INSTALL_DISMISS_KEY);
  if (!ts) return false;
  return (Date.now() - Number(ts)) < INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function showInstallBanner() {
  const id = 'pwa-install-banner';
  if (document.getElementById(id)) return;

  const el = document.createElement('div');
  el.id = id;
  el.className = 'pwa-install-banner scale-in';
  el.innerHTML = `
    <span>Install Project Tracker for offline use</span>
    <div class="pwa-install-banner-actions">
      <button id="pwa-install-btn" class="btn primary sm">Install</button>
      <button id="pwa-install-dismiss-btn" class="btn ghost sm">Dismiss</button>
    </div>`;
  getOrCreateTopBannerRoot().insertBefore(el, getOrCreateTopBannerRoot().firstChild);

  document.getElementById('pwa-install-btn').addEventListener('click', async () => {
    removeBanner(id);
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      localStorage.setItem(PWA_INSTALLED_KEY, 'true');
    }
    deferredInstallPrompt = null;
  });

  document.getElementById('pwa-install-dismiss-btn').addEventListener('click', () => {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
    removeBanner(id);
  });
}

function initInstallPrompt() {
  if (localStorage.getItem(PWA_INSTALLED_KEY) === 'true') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (!isInstallDismissed()) showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    localStorage.setItem(PWA_INSTALLED_KEY, 'true');
    removeBanner('pwa-install-banner');
  });
}

/* ==========================================================================
   Init
   ========================================================================== */

function initPWA() {
  registerServiceWorker();
  initOfflineIndicator();
  initInstallPrompt();
}

window.initPWA = initPWA;
