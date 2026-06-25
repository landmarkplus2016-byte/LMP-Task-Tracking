/* ==========================================================================
   Sync — shared folder load/save, lock file, error handling (CLAUDE.md Stage 6.1)
   ========================================================================== */

const SHARED_FOLDER_KEY = 'pt_shared_folder';
const SHARED_FOLDER_HANDLE_KEY = 'shared_folder_dir_handle';
const MASTER_FILENAME = 'master_latest.json';
const LOCK_FILENAME = 'master_latest.lock';
const SYNC_HISTORY_KEY = 'sync_history';
const SYNC_LAST_LOADED_KEY = 'sync_last_loaded';
const SYNC_LAST_SAVED_KEY = 'sync_last_saved';
const SYNC_PENDING_FAILURE_KEY = 'sync_pending_failure';
const SYNC_RETRY_INTERVAL_MS = 2 * 60 * 1000;
const SYNC_BANNER_DISMISS_KEY = 'pt_sync_banner_dismissed';

const PRESENCE_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const PRESENCE_GREEN_MS = 60 * 1000;
const PRESENCE_AMBER_MS = 5 * 60 * 1000;
const PRESENCE_STALE_MS = 10 * 60 * 1000;

let syncRetryTimer = null;
let presenceHeartbeatTimer = null;
let presenceState = { users: [] };

/* ==========================================================================
   Folder configuration
   ========================================================================== */

function isFileSystemAccessSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

function getSharedFolderLabel() {
  return localStorage.getItem(SHARED_FOLDER_KEY) || '';
}

function setSharedFolderLabel(label) {
  if (label) {
    localStorage.setItem(SHARED_FOLDER_KEY, label);
  } else {
    localStorage.removeItem(SHARED_FOLDER_KEY);
  }
}

async function getStoredDirHandle() {
  const setting = await db.app_settings.get(SHARED_FOLDER_HANDLE_KEY);
  return (setting && setting.value) || null;
}

async function storeDirHandle(handle) {
  await db.app_settings.put({ key: SHARED_FOLDER_HANDLE_KEY, value: handle, updated_at: new Date() });
}

async function ensureDirPermission(handle) {
  if (!handle) return false;
  try {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return (await handle.requestPermission(opts)) === 'granted';
  } catch (e) {
    return false;
  }
}

async function chooseSharedFolder() {
  if (!isFileSystemAccessSupported()) {
    showToast('Your browser does not support folder access. Use Chrome or Edge on desktop.', 'error');
    return null;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const granted = await ensureDirPermission(handle);
    if (!granted) {
      showToast('Permission to the folder was not granted.', 'error');
      return null;
    }
    await storeDirHandle(handle);
    setSharedFolderLabel(handle.name);
    return handle;
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Could not access that folder.', 'error');
    return null;
  }
}

async function getReadySharedFolderHandle() {
  if (!getSharedFolderLabel()) {
    showToast('Configure shared folder path first.', 'error');
    return null;
  }
  const handle = await getStoredDirHandle();
  if (!handle) {
    showToast('Shared folder needs to be reselected on this device. Click Browse.', 'error');
    return null;
  }
  const granted = await ensureDirPermission(handle);
  if (!granted) {
    showToast('Permission to the shared folder was denied.', 'error');
    return null;
  }
  return handle;
}

async function testSharedFolderPath() {
  const handle = await getReadySharedFolderHandle();
  if (!handle) return;
  try {
    for await (const _ of handle.keys()) break;
    showToast(`"${handle.name}" is accessible.`, 'success');
  } catch (e) {
    showToast('Could not read that folder.', 'error');
  }
}

/* ==========================================================================
   File I/O helpers
   ========================================================================== */

async function readJsonFromFolder(handle, filename) {
  try {
    const fileHandle = await handle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'NotFoundError') return null;
    throw e;
  }
}

async function writeJsonToFolder(handle, filename, data) {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

async function deleteFileFromFolder(handle, filename) {
  try {
    await handle.removeEntry(filename);
  } catch (e) {
    if (e.name !== 'NotFoundError') throw e;
  }
}

/* ==========================================================================
   Lock file
   ========================================================================== */

async function readLockFile(handle) {
  return await readJsonFromFolder(handle, LOCK_FILENAME);
}

function buildPresenceEntry(currentUser, existingEntry) {
  const now = new Date().toISOString();
  return {
    name: currentUser.name,
    locked_at: (existingEntry && existingEntry.locked_at) || now,
    last_heartbeat: now,
    device: navigator.userAgent
  };
}

function upsertLockUsers(lock, currentUser) {
  const users = Array.isArray(lock && lock.users) ? lock.users.slice() : [];
  const idx = users.findIndex(u => u.name === currentUser.name);
  const entry = buildPresenceEntry(currentUser, idx !== -1 ? users[idx] : null);
  if (idx !== -1) users[idx] = entry; else users.push(entry);
  return { users };
}

function pruneStalePresence(lock) {
  const users = Array.isArray(lock && lock.users) ? lock.users : [];
  const now = Date.now();
  return { users: users.filter(u => now - new Date(u.last_heartbeat).getTime() <= PRESENCE_STALE_MS) };
}

function getOtherActiveLockUsers(lock, currentUser) {
  const users = Array.isArray(lock && lock.users) ? lock.users : [];
  const now = Date.now();
  return users.filter(u => u.name !== currentUser.name && (now - new Date(u.last_heartbeat).getTime()) <= PRESENCE_AMBER_MS);
}

async function writeLockFile(handle, currentUser) {
  let existingLock = null;
  try { existingLock = await readLockFile(handle); } catch (e) { existingLock = null; }
  const lock = upsertLockUsers(pruneStalePresence(existingLock), currentUser);
  await writeJsonToFolder(handle, LOCK_FILENAME, lock);
  presenceState.users = lock.users;
  return lock;
}

async function deleteLockFile(handle) {
  await deleteFileFromFolder(handle, LOCK_FILENAME);
}

function syncFormatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ==========================================================================
   Confirm modal — small reusable yes/no dialog for sync flows
   ========================================================================== */

function confirmDialog({ title, message, confirmLabel }) {
  return new Promise(resolve => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const escHandler = (e) => { if (e.key === 'Escape') close(false); };
    const close = (result) => {
      root.remove();
      document.removeEventListener('keydown', escHandler);
      resolve(result);
    };

    root.innerHTML = `
      <div class="modal-backdrop scale-in" id="sync-confirm-backdrop">
        <div class="card modal" id="sync-confirm-card">
          <div class="modal-header">
            <h2>${escapeHtml(title)}</h2>
            <button class="icon-btn" id="sync-confirm-close">${iconSvg('close', 16)}</button>
          </div>
          <div class="modal-body">
            <p style="font-size:13px;color:var(--ink-2);line-height:1.5;margin:0">${escapeHtml(message)}</p>
          </div>
          <div class="modal-footer">
            <button class="btn ghost" id="sync-confirm-cancel">Cancel</button>
            <button class="btn primary" id="sync-confirm-ok">${escapeHtml(confirmLabel || 'Confirm')}</button>
          </div>
        </div>
      </div>`;

    document.getElementById('sync-confirm-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'sync-confirm-backdrop') close(false);
    });
    document.getElementById('sync-confirm-close').addEventListener('click', () => close(false));
    document.getElementById('sync-confirm-cancel').addEventListener('click', () => close(false));
    document.getElementById('sync-confirm-ok').addEventListener('click', () => close(true));
    document.addEventListener('keydown', escHandler);
  });
}

/* ==========================================================================
   Diff summary — full-field comparison (PM fields included, unlike
   the coordinator import diff in import.js) used only to show counts.
   ========================================================================== */

function valuesEqualForSync(a, b) {
  const av = a === undefined ? null : a;
  const bv = b === undefined ? null : b;
  if (av === null && bv === null) return true;
  if ((av === null) !== (bv === null)) return false;
  if (av instanceof Date || bv instanceof Date) {
    return new Date(av).getTime() === new Date(bv).getTime();
  }
  if (typeof av === 'object' && typeof bv === 'object') {
    return JSON.stringify(av) === JSON.stringify(bv);
  }
  return av === bv;
}

function tasksEqualForSync(existing, incoming) {
  const keys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  for (const key of keys) {
    if (!valuesEqualForSync(existing[key], incoming[key])) return false;
  }
  return true;
}

function diffMasterSync(incomingTasks, existingTasks) {
  const existingMap = new Map(existingTasks.map(t => [t.id, t]));
  let newCount = 0, changedCount = 0, unchangedCount = 0;

  incomingTasks.forEach(incoming => {
    const existing = existingMap.get(incoming.id);
    if (!existing) { newCount++; return; }
    if (tasksEqualForSync(existing, incoming)) unchangedCount++;
    else changedCount++;
  });

  return { newCount, changedCount, unchangedCount, totalIncoming: incomingTasks.length };
}

/* ==========================================================================
   Load
   ========================================================================== */

async function loadFromSharedFolder() {
  const currentUser = getCurrentUser();
  const handle = await getReadySharedFolderHandle();
  if (!handle) return;

  let lock;
  try {
    lock = await readLockFile(handle);
  } catch (e) {
    showToast('Could not read the lock file.', 'error');
    return;
  }

  const otherActiveUsers = getOtherActiveLockUsers(lock, currentUser);
  if (otherActiveUsers.length > 0) {
    const names = otherActiveUsers.map(u => u.name).join(', ');
    const message = otherActiveUsers.length === 1
      ? `${names} has this open since ${syncFormatDateTime(otherActiveUsers[0].locked_at)}. Load anyway?`
      : `${otherActiveUsers.length} other people have this open (${names}). Load anyway?`;
    const proceed = await confirmDialog({ title: 'Shared file is in use', message, confirmLabel: 'Load anyway' });
    if (!proceed) return;
  }

  let payload;
  try {
    payload = await readJsonFromFolder(handle, MASTER_FILENAME);
  } catch (e) {
    showToast('Could not read master_latest.json.', 'error');
    return;
  }

  if (!payload || !Array.isArray(payload.tasks)) {
    showToast('No master file found in the shared folder yet. Save once to create it.', 'warning');
    return;
  }

  const existingTasks = await db.tasks.toArray();
  const diff = diffMasterSync(payload.tasks, existingTasks);

  const proceed = await confirmDialog({
    title: 'Load Latest Master',
    message: `${diff.newCount} new, ${diff.changedCount} changed, ${diff.unchangedCount} unchanged out of ${diff.totalIncoming} tasks in the shared file. Saved ${syncFormatDateTime(payload.exported_at)}. Load this into your local copy?`,
    confirmLabel: 'Load'
  });
  if (!proceed) return;

  await applyMasterPayload(payload);
  await writeLockFile(handle, currentUser);

  await db.app_settings.put({ key: SYNC_LAST_LOADED_KEY, value: new Date().toISOString(), updated_at: new Date() });
  await appendSyncHistory({ action: 'load', by: currentUser.name, timestamp: new Date().toISOString(), task_count: payload.tasks.length });

  showToast(`Master loaded. ${diff.newCount} new, ${diff.changedCount} changed.`, 'success');
  if (typeof settingsState !== 'undefined' && settingsState.activeSection === 'sync') renderSyncSettings();
}

/* ==========================================================================
   Apply incoming master payload
   ========================================================================== */

async function applyIncomingUsers(users) {
  if (!Array.isArray(users)) return;
  for (const incoming of users) {
    const { password_hash, ...rest } = incoming;
    const existing = await db.users.get(incoming.id);
    if (existing) {
      await db.users.update(incoming.id, rest);
    } else {
      await db.users.add({ ...rest, password_hash: null, must_change_password: true });
    }
  }
}

async function applyIncomingSettings(settingsArr) {
  if (!Array.isArray(settingsArr)) return;
  for (const setting of settingsArr) {
    if (setting.key === SHARED_FOLDER_HANDLE_KEY) continue;
    await db.app_settings.put(setting);
  }
}

async function applyMasterPayload(payload) {
  if (payload.tasks.length > 0) await db.tasks.bulkPut(payload.tasks);
  await applyIncomingUsers(payload.users);
  await applyIncomingSettings(payload.settings);
}

/* ==========================================================================
   Save
   ========================================================================== */

async function buildMasterExportPayload() {
  const currentUser = getCurrentUser();
  const tasks = await db.tasks.toArray();
  const users = (await db.users.toArray()).map(({ password_hash, ...rest }) => rest);
  const settings = (await db.app_settings.toArray()).filter(s => s.key !== SHARED_FOLDER_HANDLE_KEY);

  return {
    exported_at: new Date().toISOString(),
    exported_by: currentUser.name,
    version: '1.0',
    tasks,
    users,
    settings
  };
}

async function saveToSharedFolder() {
  await performSave({ isRetry: false });
}

async function attemptRetrySave() {
  await performSave({ isRetry: true });
}

async function performSave({ isRetry }) {
  const currentUser = getCurrentUser();
  const payload = await buildMasterExportPayload();

  const handle = isRetry ? await getStoredDirHandle() : await getReadySharedFolderHandle();
  if (!handle) return;

  if (isRetry) {
    let granted = false;
    try { granted = (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { granted = false; }
    if (!granted) return;
  }

  try {
    await writeJsonToFolder(handle, MASTER_FILENAME, payload);
    await deleteLockFile(handle);
  } catch (e) {
    if (!isRetry) await handleSaveFailure(payload);
    return;
  }

  clearPersistentSyncErrorBanner();
  await db.app_settings.delete(SYNC_PENDING_FAILURE_KEY);
  await db.app_settings.put({ key: SYNC_LAST_SAVED_KEY, value: new Date().toISOString(), updated_at: new Date() });
  await appendSyncHistory({ action: 'save', by: currentUser.name, timestamp: new Date().toISOString(), task_count: payload.tasks.length });

  showToast(isRetry ? 'Master saved. Pending changes synced.' : 'Master saved. Others can now load the latest version.', 'success');
  if (typeof settingsState !== 'undefined' && settingsState.activeSection === 'sync') renderSyncSettings();
}

/* ==========================================================================
   Save failure — emergency backup + persistent banner + auto-retry
   ========================================================================== */

function emergencyBackupFilename() {
  const now = new Date();
  return `master_pending_${formatDateISO(now)}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}.json`;
}

async function handleSaveFailure(payload) {
  const filename = emergencyBackupFilename();
  downloadBlob(JSON.stringify(payload, null, 2), filename, 'application/json');

  await db.app_settings.put({
    key: SYNC_PENDING_FAILURE_KEY,
    value: { failed_at: new Date().toISOString(), backup_filename: filename },
    updated_at: new Date()
  });

  showPersistentSyncErrorBanner();
  scheduleSyncRetry();
}

function showPersistentSyncErrorBanner() {
  const root = document.getElementById('global-banner-root');
  if (!root || document.getElementById('sync-error-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sync-error-banner';
  banner.className = 'sync-error-banner';
  banner.innerHTML = `
    ${iconSvg('warn', 16)}
    <span class="sync-error-banner-text"><strong>Shared folder save failed.</strong> Emergency backup saved locally. Do NOT close the app.</span>
    <button class="btn sm" id="sync-error-retry-btn">Retry now</button>
    <button class="btn ghost sm" id="sync-error-relocate-btn">Save to different location</button>`;
  root.appendChild(banner);

  document.getElementById('sync-error-retry-btn').addEventListener('click', attemptRetrySave);
  document.getElementById('sync-error-relocate-btn').addEventListener('click', async () => {
    const handle = await chooseSharedFolder();
    if (handle) attemptRetrySave();
  });
}

function clearPersistentSyncErrorBanner() {
  const banner = document.getElementById('sync-error-banner');
  if (banner) banner.remove();
  if (syncRetryTimer) {
    clearInterval(syncRetryTimer);
    syncRetryTimer = null;
  }
}

function scheduleSyncRetry() {
  if (syncRetryTimer) return;
  syncRetryTimer = setInterval(attemptRetrySave, SYNC_RETRY_INTERVAL_MS);
}

async function checkPendingSyncFailure() {
  const user = getCurrentUser();
  if (!user || !MASTER_ROLES.includes(user.role)) return;

  const pending = await db.app_settings.get(SYNC_PENDING_FAILURE_KEY);
  if (!pending || !pending.value) return;

  showPersistentSyncErrorBanner();
  scheduleSyncRetry();
}

/* ==========================================================================
   Sync history (last 30 entries)
   ========================================================================== */

async function appendSyncHistory(entry) {
  const setting = await db.app_settings.get(SYNC_HISTORY_KEY);
  const history = (setting && setting.value) || [];
  history.unshift(entry);
  await db.app_settings.put({ key: SYNC_HISTORY_KEY, value: history.slice(0, 30), updated_at: new Date() });
}

async function getSyncHistory() {
  const setting = await db.app_settings.get(SYNC_HISTORY_KEY);
  return (setting && setting.value) || [];
}

/* ==========================================================================
   Startup banner — "Load latest master from shared folder before working?"
   ========================================================================== */

function renderSyncStartupBanner() {
  const user = getCurrentUser();
  if (!user || !MASTER_ROLES.includes(user.role)) return;
  if (!getSharedFolderLabel()) return;
  if (sessionStorage.getItem(SYNC_BANNER_DISMISS_KEY)) return;

  const root = document.getElementById('global-banner-root');
  if (!root || document.getElementById('sync-startup-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sync-startup-banner';
  banner.className = 'sync-startup-banner';
  banner.innerHTML = `
    ${iconSvg('import', 15)}
    <span>Load latest master from shared folder before working?</span>
    <button class="btn primary sm" id="sync-startup-load-btn">Load now</button>
    <button class="btn ghost sm" id="sync-startup-later-btn">Later</button>`;
  root.appendChild(banner);

  document.getElementById('sync-startup-load-btn').addEventListener('click', async () => {
    banner.remove();
    await loadFromSharedFolder();
  });
  document.getElementById('sync-startup-later-btn').addEventListener('click', () => {
    sessionStorage.setItem(SYNC_BANNER_DISMISS_KEY, 'true');
    banner.remove();
  });
}

/* ==========================================================================
   Heartbeat + presence indicator (CLAUDE.md Stage 6.2)
   ========================================================================== */

function presenceStatus(lastHeartbeatIso) {
  const ageMs = Date.now() - new Date(lastHeartbeatIso).getTime();
  if (ageMs < PRESENCE_GREEN_MS) return 'green';
  if (ageMs < PRESENCE_AMBER_MS) return 'amber';
  return 'grey';
}

function presenceAvatarHtml(entry, isSelf) {
  const status = presenceStatus(entry.last_heartbeat);
  const lastSeen = isSelf ? 'Active now' : `Last seen ${syncFormatDateTime(entry.last_heartbeat)}`;
  return `
    <span class="presence-avatar presence-${status}" title="${escapeHtml(entry.name)}${isSelf ? ' (you)' : ''} — ${escapeHtml(lastSeen)}">
      ${escapeHtml(initials(entry.name))}
    </span>`;
}

function renderPresenceBar() {
  const root = document.getElementById('presence-bar-root');
  if (!root) return;

  const user = getCurrentUser();
  if (!user || !MASTER_ROLES.includes(user.role) || !getSharedFolderLabel()) {
    root.innerHTML = '';
    return;
  }

  const now = Date.now();
  let users = (presenceState.users || []).filter(u => now - new Date(u.last_heartbeat).getTime() <= PRESENCE_STALE_MS);

  if (!users.some(u => u.name === user.name)) {
    users = [...users, { name: user.name, last_heartbeat: new Date().toISOString(), locked_at: new Date().toISOString(), device: navigator.userAgent }];
  }

  users = users.slice().sort((a, b) => {
    if (a.name === user.name) return -1;
    if (b.name === user.name) return 1;
    return a.name.localeCompare(b.name);
  });

  if (users.length <= 1) {
    root.innerHTML = `<div class="presence-bar"><span class="presence-bar-label">Only you are active</span></div>`;
    return;
  }

  root.innerHTML = `
    <div class="presence-bar">
      <span class="presence-bar-label">Active now:</span>
      <div class="presence-avatars">
        ${users.map(u => presenceAvatarHtml(u, u.name === user.name)).join('')}
      </div>
    </div>`;
}

async function presenceHeartbeatTick() {
  const user = getCurrentUser();
  if (!user || !MASTER_ROLES.includes(user.role)) {
    stopPresenceHeartbeat();
    return;
  }
  if (!getSharedFolderLabel()) {
    renderPresenceBar();
    return;
  }

  const handle = await getStoredDirHandle();
  if (!handle) {
    renderPresenceBar();
    return;
  }

  let granted = false;
  try { granted = (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { granted = false; }

  try {
    if (granted) {
      await writeLockFile(handle, user);
    } else {
      const lock = await readLockFile(handle);
      presenceState.users = pruneStalePresence(lock).users;
    }
  } catch (e) {
    // shared folder temporarily unreachable — keep last known presence state
  }

  renderPresenceBar();
}

function startPresenceHeartbeat() {
  const user = getCurrentUser();
  if (!user || !MASTER_ROLES.includes(user.role)) return;
  if (presenceHeartbeatTimer) return;

  presenceHeartbeatTick();
  presenceHeartbeatTimer = setInterval(presenceHeartbeatTick, PRESENCE_HEARTBEAT_INTERVAL_MS);
}

function stopPresenceHeartbeat() {
  if (presenceHeartbeatTimer) {
    clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = null;
  }
  presenceState.users = [];
  const root = document.getElementById('presence-bar-root');
  if (root) root.innerHTML = '';
}

/* ==========================================================================
   Settings → Sync & Shared Folder
   ========================================================================== */

async function renderSyncSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  const label = getSharedFolderLabel();
  const handle = await getStoredDirHandle();
  const lastLoadedSetting = await db.app_settings.get(SYNC_LAST_LOADED_KEY);
  const lastSavedSetting = await db.app_settings.get(SYNC_LAST_SAVED_KEY);
  const history = await getSyncHistory();

  container.innerHTML = `
    <div class="fade-in">
      <h1>Sync &amp; Shared Folder</h1>
      <p class="tasks-subtitle">PM, AM, and CCM share the master task list through this folder.</p>

      <div class="card sync-card">
        <div class="sync-card-title">Shared Folder Path</div>
        <div class="sync-folder-row">
          <input id="sync-folder-input" type="text" class="input" placeholder="No folder configured" value="${escapeHtml(label)}">
          <button id="sync-browse-btn" class="btn ghost">${iconSvg('layers', 14)}<span>Browse</span></button>
          <button id="sync-test-btn" class="btn ghost" ${(!label || !handle) ? 'disabled' : ''}>Test path</button>
        </div>
        ${!isFileSystemAccessSupported() ? `<div class="field-hint-warning" style="margin-top:8px">${iconSvg('warn', 12)}<span>This browser does not support folder access (use Chrome or Edge desktop).</span></div>` : ''}
        ${label && !handle ? `<div class="field-hint-warning" style="margin-top:8px">${iconSvg('warn', 12)}<span>Folder needs to be reselected on this device.</span></div>` : ''}
      </div>

      <div class="card sync-card">
        <div class="sync-card-title">Load &amp; Save</div>
        <div class="sync-action-row">
          <div class="sync-action-col">
            <button id="sync-load-btn" class="btn primary" ${!label ? 'disabled' : ''}>${iconSvg('download', 14)}<span>Load from Shared Folder</span></button>
            <div class="sync-action-meta">Last loaded: ${lastLoadedSetting ? syncFormatDateTime(lastLoadedSetting.value) : 'Never'}</div>
          </div>
          <div class="sync-action-col">
            <button id="sync-save-btn" class="btn primary" ${!label ? 'disabled' : ''}>${iconSvg('check', 14)}<span>Save &amp; Release</span></button>
            <div class="sync-action-meta">Last saved: ${lastSavedSetting ? syncFormatDateTime(lastSavedSetting.value) : 'Never'}</div>
          </div>
        </div>
      </div>

      <div class="card sync-card">
        <div class="sync-card-title">Sync History <span class="import-section-count">${history.length}</span></div>
        ${history.length === 0 ? `<p style="font-size:12.5px;color:var(--ink-3);margin:0">No sync activity yet.</p>` : `
        <table class="data-table catalog-items-table">
          <thead>
            <tr><th style="width:160px">Date</th><th style="width:80px">Action</th><th>By</th><th class="num-col" style="width:90px">Tasks</th></tr>
          </thead>
          <tbody>
            ${history.map(h => `
              <tr>
                <td class="mono">${syncFormatDateTime(h.timestamp)}</td>
                <td>${h.action === 'save' ? 'Save' : 'Load'}</td>
                <td>${escapeHtml(h.by || '')}</td>
                <td class="num-col num">${h.task_count}</td>
              </tr>`).join('')}
          </tbody>
        </table>`}
      </div>
    </div>`;

  attachSyncSettingsEvents();
}

function attachSyncSettingsEvents() {
  document.getElementById('sync-folder-input').addEventListener('blur', (e) => {
    setSharedFolderLabel(e.target.value.trim());
    renderSyncSettings();
  });
  document.getElementById('sync-browse-btn').addEventListener('click', async () => {
    const handle = await chooseSharedFolder();
    if (handle) {
      showToast(`Shared folder set to "${handle.name}".`, 'success');
      renderSyncSettings();
      presenceHeartbeatTick();
    }
  });
  document.getElementById('sync-test-btn').addEventListener('click', testSharedFolderPath);
  document.getElementById('sync-load-btn').addEventListener('click', loadFromSharedFolder);
  document.getElementById('sync-save-btn').addEventListener('click', saveToSharedFolder);
}

window.isFileSystemAccessSupported = isFileSystemAccessSupported;
window.chooseSharedFolder = chooseSharedFolder;
window.testSharedFolderPath = testSharedFolderPath;
window.loadFromSharedFolder = loadFromSharedFolder;
window.saveToSharedFolder = saveToSharedFolder;
window.renderSyncSettings = renderSyncSettings;
window.renderSyncStartupBanner = renderSyncStartupBanner;
window.checkPendingSyncFailure = checkPendingSyncFailure;
window.startPresenceHeartbeat = startPresenceHeartbeat;
window.stopPresenceHeartbeat = stopPresenceHeartbeat;
window.renderPresenceBar = renderPresenceBar;
