/* ==========================================================================
   User account sync with the Google Apps Script Web App.
   This is the only file that talks to the Sheet — all other files call
   these functions only. No secret constants, no auth logic; the Apps
   Script URL is the only configuration, stored by the PM in app_settings
   (Settings → Sync & Shared Folder). Source of truth: USER_SYNC.md.
   ========================================================================== */

const PENDING_SYNC_KEY = 'pending_user_sync';

async function getScriptUrl(db) {
  const record = await db.app_settings.get('apps_script_url');
  return record && record.value ? record.value : null;
}

async function fetchUsersFromSheet(db) {
  const url = await getScriptUrl(db);
  if (!url) {
    throw new Error('SCRIPT_URL_NOT_CONFIGURED');
  }

  const response = await fetch(url + '?action=getUsers');
  if (!response.ok) {
    throw new Error('FETCH_FAILED: ' + response.status);
  }

  return await response.json();
}

async function pushUserToSheet(db, action, payload) {
  const url = await getScriptUrl(db);
  if (!url) {
    throw new Error('SCRIPT_URL_NOT_CONFIGURED');
  }

  const body = Object.assign({ action }, payload);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  if (result.success === false) {
    throw new Error(result.error);
  }

  return result;
}

async function syncUsersToLocal(db) {
  const users = await fetchUsersFromSheet(db);

  for (const user of users) {
    const existing = await db.users.get(user.id);

    if (existing && existing.must_change_password === false) {
      // User has already set their own password — never overwrite it.
      // Only update the fields the Sheet is authoritative for.
      await db.users.update(user.id, {
        name: user.name,
        email: user.email,
        role: user.role,
        prefix: user.prefix,
        is_active: user.is_active,
        deactivated_at: user.deactivated_at,
        deactivated_by: user.deactivated_by
      });
    } else {
      // New user OR user who has not changed their temp password yet.
      await db.users.put(user);
    }
  }

  return { synced: users.length };
}

async function queueFailedSync(db, action, payload) {
  const existing = await db.app_settings.get(PENDING_SYNC_KEY);
  const queue = existing ? JSON.parse(existing.value) : [];

  queue.push({ action, payload, queued_at: new Date().toISOString() });

  await db.app_settings.put({
    key: PENDING_SYNC_KEY,
    value: JSON.stringify(queue),
    updated_at: new Date().toISOString()
  });
}

async function retryPendingSync(db) {
  const record = await db.app_settings.get(PENDING_SYNC_KEY);
  if (!record) {
    return { retried: 0, remaining: 0 };
  }

  const queue = JSON.parse(record.value);
  if (queue.length === 0) {
    return { retried: 0, remaining: 0 };
  }

  const successful = [];

  for (const item of queue) {
    try {
      await pushUserToSheet(db, item.action, item.payload);
      successful.push(item);
    } catch (err) {
      // leave in queue, will retry next open
    }
  }

  const remaining = queue.filter(item => !successful.includes(item));

  if (remaining.length === 0) {
    await db.app_settings.delete(PENDING_SYNC_KEY);
  } else {
    await db.app_settings.put({
      key: PENDING_SYNC_KEY,
      value: JSON.stringify(remaining),
      updated_at: new Date().toISOString()
    });
  }

  return { retried: successful.length, remaining: remaining.length };
}

window.PENDING_SYNC_KEY = PENDING_SYNC_KEY;
window.getScriptUrl = getScriptUrl;
window.fetchUsersFromSheet = fetchUsersFromSheet;
window.pushUserToSheet = pushUserToSheet;
window.syncUsersToLocal = syncUsersToLocal;
window.queueFailedSync = queueFailedSync;
window.retryPendingSync = retryPendingSync;
