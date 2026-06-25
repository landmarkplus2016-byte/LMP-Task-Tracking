/* ==========================================================================
   Auto-backup + manual backup + restore (CLAUDE.md Stage 10.1)
   ========================================================================== */

const BACKUP_FOLDER_KEY = 'pt_backup_folder';
const BACKUP_FOLDER_HANDLE_KEY = 'backup_folder_dir_handle';
const BACKUP_INTERVAL_KEY = 'backup_interval_minutes';
const LAST_BACKUP_KEY = 'last_backup_at';
const BACKUP_VERSION = '1.0';
const BACKUP_INTERVAL_OPTIONS = [10, 15, 30, 60];

let autoBackupTimer = null;

/* ==========================================================================
   Folder configuration — same File System Access pattern as sync.js
   ========================================================================== */

function getBackupFolderLabel() {
  return localStorage.getItem(BACKUP_FOLDER_KEY) || '';
}

function setBackupFolderLabel(label) {
  if (label) {
    localStorage.setItem(BACKUP_FOLDER_KEY, label);
  } else {
    localStorage.removeItem(BACKUP_FOLDER_KEY);
  }
}

async function getStoredBackupDirHandle() {
  const setting = await db.app_settings.get(BACKUP_FOLDER_HANDLE_KEY);
  return (setting && setting.value) || null;
}

async function storeBackupDirHandle(handle) {
  await db.app_settings.put({ key: BACKUP_FOLDER_HANDLE_KEY, value: handle, updated_at: new Date() });
}

async function chooseBackupFolder() {
  if (!isFileSystemAccessSupported()) {
    showToast('Your browser does not support folder access. Backups will go to your Downloads folder.', 'error');
    return null;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const granted = await ensureDirPermission(handle);
    if (!granted) {
      showToast('Permission to the folder was not granted.', 'error');
      return null;
    }
    await storeBackupDirHandle(handle);
    setBackupFolderLabel(handle.name);
    return handle;
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Could not access that folder.', 'error');
    return null;
  }
}

/* ==========================================================================
   Interval + last-backup settings
   ========================================================================== */

async function getBackupIntervalMinutes() {
  const setting = await db.app_settings.get(BACKUP_INTERVAL_KEY);
  const value = setting && Number(setting.value);
  return BACKUP_INTERVAL_OPTIONS.includes(value) ? value : 30;
}

async function setBackupIntervalMinutes(minutes) {
  await db.app_settings.put({ key: BACKUP_INTERVAL_KEY, value: minutes, updated_at: new Date() });
}

async function getLastBackupInfo() {
  const setting = await db.app_settings.get(LAST_BACKUP_KEY);
  return (setting && setting.value) || null;
}

async function setLastBackupInfo(info) {
  await db.app_settings.put({ key: LAST_BACKUP_KEY, value: info, updated_at: new Date() });
}

/* ==========================================================================
   Backup
   ========================================================================== */

async function buildBackupPayload(currentUser) {
  const tasks = await db.tasks.toArray();
  const settingsRows = await db.app_settings.toArray();
  const settings = {};
  settingsRows.forEach(s => {
    if (!s.key.endsWith('_dir_handle')) settings[s.key] = s.value;
  });

  return {
    backup_date: new Date().toISOString(),
    user_id: currentUser.id,
    user_name: currentUser.name,
    role: currentUser.role,
    version: BACKUP_VERSION,
    tasks,
    settings
  };
}

function backupFilenameFor(currentUser, now) {
  const datePart = formatDateISO(now);
  const timePart = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  return `${sanitizeFilenamePart(currentUser.name)}_backup_${datePart}_${timePart}.json`;
}

async function writeBackupFile(filename, payload) {
  if (getBackupFolderLabel()) {
    const handle = await getStoredBackupDirHandle();
    if (handle && await ensureDirPermission(handle)) {
      await writeJsonToFolder(handle, filename, payload);
      return { location: handle.name };
    }
  }

  downloadBlob(JSON.stringify(payload, null, 2), filename, 'application/json');
  return { location: 'Downloads' };
}

async function backupNow(silent) {
  const currentUser = getCurrentUser();
  if (!currentUser) return null;

  const now = new Date();
  const payload = await buildBackupPayload(currentUser);
  const filename = backupFilenameFor(currentUser, now);
  const result = await writeBackupFile(filename, payload);

  await setLastBackupInfo({ timestamp: now.toISOString(), location: result.location, filename, task_count: payload.tasks.length });

  if (silent) {
    showToast('Auto-backup saved', 'success', 3000);
  } else {
    showToast(`Backup saved: ${filename}`, 'success');
  }

  return { filename, location: result.location, task_count: payload.tasks.length };
}

async function startAutoBackup() {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
  const minutes = await getBackupIntervalMinutes();
  autoBackupTimer = setInterval(() => backupNow(true), minutes * 60 * 1000);
}

/* ==========================================================================
   Restore
   ========================================================================== */

async function restoreFromBackup(file) {
  let data;
  try {
    const text = await file.text();
    data = JSON.parse(text);
  } catch (e) {
    showToast('Invalid backup file — could not parse JSON.', 'error');
    return;
  }

  if (!data || data.version !== BACKUP_VERSION || !Array.isArray(data.tasks)) {
    showToast('Invalid backup file — missing version or tasks array.', 'error');
    return;
  }

  const dateLabel = data.backup_date ? formatDate(data.backup_date) : 'an unknown date';
  const confirmed = window.confirm(`This backup contains ${data.tasks.length} tasks from ${dateLabel}. Restore will replace your local data. Continue?`);
  if (!confirmed) return;

  await db.tasks.clear();
  if (data.tasks.length) await db.tasks.bulkAdd(data.tasks);

  if (data.settings && typeof data.settings === 'object') {
    const now = new Date();
    for (const [key, value] of Object.entries(data.settings)) {
      if (key.endsWith('_dir_handle')) continue;
      await db.app_settings.put({ key, value, updated_at: now });
    }
  }

  const currentUser = getCurrentUser();
  await writeAuditLog({ user_id: currentUser ? currentUser.id : null, action: 'restore_applied' });

  showToast(`Restore complete. ${data.tasks.length} tasks loaded.`, 'success');
  setTimeout(() => location.reload(), 1200);
}

/* ==========================================================================
   Settings → Backup & Data
   ========================================================================== */

function formatDateTimeShort(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${formatDate(d)} at ${time}`;
}

async function renderBackupSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  const label = getBackupFolderLabel();
  const handle = await getStoredBackupDirHandle();
  const intervalMinutes = await getBackupIntervalMinutes();
  const lastBackup = await getLastBackupInfo();

  container.innerHTML = `
    <div class="fade-in">
      <h1>Backup &amp; Data</h1>
      <p class="tasks-subtitle">Backups run automatically in the background and can also be triggered manually. Stored on this device only.</p>

      <div class="card sync-card">
        <div class="sync-card-title">Backup Folder Path</div>
        <div class="sync-folder-row">
          <input id="backup-folder-input" type="text" class="input" placeholder="No folder configured" value="${escapeHtml(label)}">
          <button id="backup-browse-btn" class="btn ghost">${iconSvg('layers', 14)}<span>Browse</span></button>
        </div>
        ${!label ? `<div class="field-hint-warning" style="margin-top:8px">${iconSvg('warn', 12)}<span>No backup folder set. Using Downloads folder.</span></div>` : ''}
        ${label && !handle ? `<div class="field-hint-warning" style="margin-top:8px">${iconSvg('warn', 12)}<span>Folder needs to be reselected on this device.</span></div>` : ''}
        ${!isFileSystemAccessSupported() ? `<div class="field-hint-warning" style="margin-top:8px">${iconSvg('warn', 12)}<span>This browser does not support folder access — backups will go to Downloads.</span></div>` : ''}
      </div>

      <div class="card sync-card">
        <div class="sync-card-title">Auto-Backup Interval</div>
        <select id="backup-interval-select" class="select" style="max-width:200px">
          ${BACKUP_INTERVAL_OPTIONS.map(m => `<option value="${m}" ${m === intervalMinutes ? 'selected' : ''}>${m} minutes</option>`).join('')}
        </select>
      </div>

      <div class="card sync-card">
        <div class="sync-card-title">Backup &amp; Restore</div>
        <div class="sync-action-row">
          <div class="sync-action-col">
            <button id="backup-now-btn" class="btn primary">${iconSvg('download', 14)}<span>Backup Now</span></button>
          </div>
          <div class="sync-action-col">
            <button id="restore-backup-btn" class="btn ghost">${iconSvg('layers', 14)}<span>Restore from Backup</span></button>
            <input id="restore-file-input" type="file" accept="application/json" class="hidden">
          </div>
        </div>
        <div class="sync-action-meta" style="margin-top:10px">Last backup: ${lastBackup ? `${formatDateTimeShort(lastBackup.timestamp)} — saved to ${escapeHtml(lastBackup.location)}` : 'Never'}</div>
      </div>
    </div>`;

  attachBackupSettingsEvents();
}

function attachBackupSettingsEvents() {
  document.getElementById('backup-folder-input').addEventListener('blur', (e) => {
    setBackupFolderLabel(e.target.value.trim());
    renderBackupSettings();
  });
  document.getElementById('backup-browse-btn').addEventListener('click', async () => {
    const handle = await chooseBackupFolder();
    if (handle) {
      showToast(`Backup folder set to "${handle.name}".`, 'success');
      renderBackupSettings();
    }
  });
  document.getElementById('backup-interval-select').addEventListener('change', async (e) => {
    const minutes = Number(e.target.value);
    await setBackupIntervalMinutes(minutes);
    await startAutoBackup();
    showToast(`Auto-backup interval set to ${minutes} minutes.`, 'success');
  });
  document.getElementById('backup-now-btn').addEventListener('click', async () => {
    await backupNow(false);
    renderBackupSettings();
  });
  document.getElementById('restore-backup-btn').addEventListener('click', () => {
    document.getElementById('restore-file-input').click();
  });
  document.getElementById('restore-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await restoreFromBackup(file);
  });
}

window.startAutoBackup = startAutoBackup;
window.backupNow = backupNow;
window.restoreFromBackup = restoreFromBackup;
window.renderBackupSettings = renderBackupSettings;
